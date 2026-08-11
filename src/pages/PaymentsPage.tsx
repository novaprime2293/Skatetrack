import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, SectionTitle, EmptyState } from '../components/ui';

function startOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}
function endOfMonth(year: number, monthIdx: number): string {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

export function PaymentsPage() {
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

  const from = startOfMonth(viewYear, viewMonth);
  const to = endOfMonth(viewYear, viewMonth);

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };
  const goNext = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const activeBatches = useMemo(() => batches.filter((b) => !b.archivedAt), [batches]);
  const activeStudents = useMemo(() => students.filter((s) => !s.archivedAt), [students]);

  // Build {sessionId -> Session} lookup for sessions in the visible month, excluding cancelled.
  const sessionsInMonthById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useStore.getState>['db']['sessions'][number]>();
    for (const sess of sessions) {
      if (sess.date >= from && sess.date <= to && sess.status !== 'cancelled') {
        map.set(sess.id, sess);
      }
    }
    return map;
  }, [sessions, from, to]);

  // Compute per-student payment breakdown for the visible month.
  // Only count attendance for sessions where the student was a member of that batch on the session's date.
  const studentPayments = useMemo(() => {
    const scopedBatchIds = batchFilter ? new Set([batchFilter]) : null;

    return activeStudents
      .map((student) => {
        const perBatch: Array<{
          batchId: string;
          batchName: string;
          classesAttended: number;
          costPerClass: number;
          total: number;
        }> = [];

        // For each batch this student was/is a member of, compute attended classes in the month.
        const studentMemberships = memberships.filter((m) => m.studentId === student.id);
        const batchesForStudent = new Map<string, typeof batches[number]>();
        for (const m of studentMemberships) {
          if (scopedBatchIds && !scopedBatchIds.has(m.batchId)) continue;
          const b = batches.find((bb) => bb.id === m.batchId);
          if (!b || b.archivedAt) continue;
          batchesForStudent.set(b.id, b);
        }

        let grandTotal = 0;

        for (const batch of batchesForStudent.values()) {
          // Find all attendance records for this student in this batch in the visible month,
          // restricted to sessions where they were a member on that date.
          let attended = 0;
          for (const att of attendance) {
            if (att.studentId !== student.id) continue;
            if (att.status !== 'present') continue; // Only "present" counts toward what to charge
            const sess = sessionsInMonthById.get(att.sessionId);
            if (!sess || sess.batchId !== batch.id) continue;
            // Was this student a member on sess.date?
            const mem = studentMemberships.find((m) => m.batchId === batch.id);
            if (!mem) continue;
            if (mem.joinedDate > sess.date) continue;
            if (mem.removedDate !== null && mem.removedDate < sess.date) continue;
            attended++;
          }
          const total = attended * batch.costPerClass;
          grandTotal += total;
          perBatch.push({
            batchId: batch.id,
            batchName: batch.name,
            classesAttended: attended,
            costPerClass: batch.costPerClass,
            total,
          });
        }

        return {
          studentId: student.id,
          name: student.name,
          perBatch,
          grandTotal,
        };
      })
      // Drop students with no per-batch entries (not in any batch that charges, or scoped out).
      .filter((row) => row.perBatch.length > 0)
      // Sort by total owed descending — biggest bills first.
      .sort((a, b) => b.grandTotal - a.grandTotal || a.name.localeCompare(b.name));
  }, [activeStudents, memberships, batches, attendance, sessionsInMonthById, batchFilter]);

  const grandTotal = useMemo(
    () => studentPayments.reduce((sum, row) => sum + row.grandTotal, 0),
    [studentPayments]
  );

  const hasAnyCost = activeBatches.some((b) => b.costPerClass > 0);

  return (
    <div className="px-4 pb-12">
      <PageHeader title="Payments" subtitle="What each student owes" />

      {/* Month selector */}
      <Card className="mb-4 !p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            ‹
          </button>
          <div className="flex-1 text-center">
            <div className="text-base font-semibold">{monthLabel}</div>
          </div>
          <button
            onClick={goNext}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            ›
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            onClick={goToday}
            disabled={isCurrentMonth}
            className="text-[10px] uppercase tracking-wider font-bold text-neon-green disabled:opacity-40 disabled:cursor-default"
          >
            Today
          </button>
        </div>
      </Card>

      {/* Optional batch filter */}
      {activeBatches.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setBatchFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
              batchFilter === null
                ? 'bg-neon-cyan text-bg-base border-neon-cyan'
                : 'bg-bg-card border-border text-fg-secondary'
            }`}
          >
            All batches
          </button>
          {activeBatches.map((b) => (
            <button
              key={b.id}
              onClick={() => setBatchFilter(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
                batchFilter === b.id
                  ? 'bg-neon-cyan text-bg-base border-neon-cyan'
                  : 'bg-bg-card border-border text-fg-secondary'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {!hasAnyCost ? (
        <EmptyState
          icon={<span className="text-3xl">💸</span>}
          title="No batch has a cost set yet"
          body="Open Batches \u2192 tap a batch \u2192 Edit and set Cost per class. Once any batch has a cost, this page will show what each student owes."
        />
      ) : studentPayments.length === 0 ? (
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">No attendance recorded yet this month.</div>
        </Card>
      ) : (
        <>
          <SectionTitle
            action={
              <span className="text-[10px] text-fg-muted">Total: {formatINR(grandTotal)}</span>
            }
          >
            Per student
          </SectionTitle>
          <div className="space-y-2">
            {studentPayments.map((row) => (
              <Card key={row.studentId}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-semibold truncate min-w-0">{row.name}</div>
                  <div className="text-base font-extrabold neon-text-green whitespace-nowrap">
                    {formatINR(row.grandTotal)}
                  </div>
                </div>
                <div className="space-y-1">
                  {row.perBatch.map((pb) => (
                    <div key={pb.batchId} className="flex items-center justify-between text-xs">
                      <div className="text-fg-secondary truncate min-w-0">
                        {pb.batchName}{' '}
                        <span className="text-fg-muted">· {pb.classesAttended} class{pb.classesAttended === 1 ? '' : 'es'} × {formatINR(pb.costPerClass)}</span>
                      </div>
                      <div className="text-fg-primary font-medium whitespace-nowrap ml-2">
                        {pb.costPerClass > 0 ? formatINR(pb.total) : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
          <div className="mt-4">
            <Card className="!p-3 border-neon-cyan/40">
              <div className="flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-[0.2em] text-neon-cyan font-bold">Total this month</div>
                <div className="text-xl font-extrabold neon-text-cyan">{formatINR(grandTotal)}</div>
              </div>
            </Card>
          </div>
          <div className="mt-3 text-[10px] text-fg-muted text-center">
            Charge = <span className="font-bold text-fg-secondary">present</span> marks only. Reschedules count toward the batch they were rescheduled into.
          </div>
        </>
      )}
    </div>
  );
}