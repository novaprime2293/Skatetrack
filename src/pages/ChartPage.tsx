import { useState, useMemo } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, EmptyState, Pill, SectionTitle } from '../components/ui';
import { StudentsPerBatchDonut } from '../components/StudentsPerBatchDonut';

function startOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}
function endOfMonth(year: number, monthIdx: number): string {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

export function ChartPage() {
  const batches = useStore((s) => s.db.batches);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const payments = useStore((s) => s.db.payments);
  const monthlyTarget = useStore((s) => s.db.teacher.monthlyTarget);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

  const from = startOfMonth(viewYear, viewMonth);
  const to = endOfMonth(viewYear, viewMonth);
  // "YYYY-MM" key for the visible month — used to look up the PaymentRecord for each student.
  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

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

  // Sessions that fall in the visible month. Exclude cancelled sessions from "done" counts (per spec §4.7).
  // No virtual/materialized recurring sessions — only persisted sessions (one-offs included).
  const sessionsInMonth = useMemo(
    () => sessions.filter((s) => s.date >= from && s.date <= to && s.status !== 'cancelled'),
    [sessions, from, to],
  );
  const sessionsInMonthById = useMemo(() => {
    const map = new Map<string, (typeof sessions)[number]>();
    for (const s of sessionsInMonth) map.set(s.id, s);
    return map;
  }, [sessionsInMonth]);

  // Section 1 — Monthly target bar chart.
  // Joseph's intent (2026-08-11): every attendance mark = 1 class attended. Count goes up
  // toward the 8-class monthly minimum. Make-up attendance in any batch's session counts too
  // ("students might mix and match and come for any 2 days if they have some other work
  // during their batch class"). So NO membership-scope filter — just count every present
  // attendance record whose session is in the visible month.
  // Note: the attendance date range is naturally bounded by `sessionsInMonth` (sessions
  // outside the visible month are excluded), so historical attendance never bleeds in.
  const monthlyProgress = useMemo(() => {
    const doneByStudent = new Map<string, number>();
    for (const att of attendance) {
      if (att.status !== 'present') continue;
      const sess = sessionsInMonthById.get(att.sessionId);
      if (!sess) continue;
      doneByStudent.set(att.studentId, (doneByStudent.get(att.studentId) ?? 0) + 1);
    }
    const rows = activeStudents
      .map((s) => {
        const done = doneByStudent.get(s.id) ?? 0;
        return { studentId: s.id, name: s.name, done };
      })
      // Students with no done classes go to the bottom of the chart (they're far from the minimum).
      .sort((a, b) => a.done - b.done || a.name.localeCompare(b.name));
    return rows;
  }, [attendance, sessionsInMonthById, activeStudents]);

  // Membership-scope lookup — used by Section 2 (perStudent) to restrict to attendance
  // for batches the student was actually enrolled in on the session date. Section 1 above
  // intentionally does NOT use this (every attendance counts toward the monthly minimum).
  const membershipLookup = useMemo(() => {
    const map = new Map<string, { joinedDate: string; removedDate: string | null }>();
    for (const m of memberships) {
      map.set(`${m.studentId}|${m.batchId}`, { joinedDate: m.joinedDate, removedDate: m.removedDate });
    }
    return map;
  }, [memberships]);

  // Section 2 — Students ranked by attendance (present / total) over visible month.
  // Applies the optional batch filter. Same membership-scope fix as Section 1: only count
  // attendance for sessions where the student was actually a member on that date.
  const perStudent = useMemo(() => {
    // If a batch filter is active, restrict to sessions of that batch.
    const scopedSessions = batchFilter
      ? sessionsInMonth.filter((s) => s.batchId === batchFilter)
      : sessionsInMonth;
    const scopedSessionIds = new Set(scopedSessions.map((s) => s.id));
    const scopedSessionById = new Map(scopedSessions.map((s) => [s.id, s]));

    const acc = new Map<string, { total: number; present: number; absent: number }>();
    for (const att of attendance) {
      if (!scopedSessionIds.has(att.sessionId)) continue;
      const sess = scopedSessionById.get(att.sessionId);
      if (!sess) continue;
      const mem = membershipLookup.get(`${att.studentId}|${sess.batchId}`);
      if (!mem) continue;
      if (mem.joinedDate > sess.date) continue;
      if (mem.removedDate !== null && mem.removedDate < sess.date) continue;
      const m = acc.get(att.studentId) ?? { total: 0, present: 0, absent: 0 };
      m.total++;
      if (att.status === 'present') m.present++;
      else m.absent++;
      acc.set(att.studentId, m);
    }
    // Limit ranked list to students who have an active OR historical membership touching this batch+month.
    const candidateIds = batchFilter
      ? new Set(
          memberships
            .filter((m) => m.batchId === batchFilter && m.removedDate === null)
            .map((m) => m.studentId)
        )
      : null;
    return [...acc.entries()]
      .map(([studentId, stats]) => {
        const student = students.find((s) => s.id === studentId);
        const payment = payments.find((p) => p.studentId === studentId && p.month === monthKey);
        return {
          studentId,
          name: student?.name ?? 'Unknown',
          ...stats,
          rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
          paid: payment?.amount ?? 0,
        };
      })
      .filter((r) => !candidateIds || candidateIds.has(r.studentId))
      .sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  }, [attendance, sessionsInMonth, students, memberships, batchFilter, membershipLookup, payments, monthKey]);

  return (
    <div className="px-4 pb-12">
      <PageHeader title="Charts" subtitle="Classes done vs. monthly minimum" />

      {/* Donut moved from Home → Charts (Q-D=A). */}
      <StudentsPerBatchDonut />

      {/* Month selector */}
      <Card className="mb-4 !p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            �
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

      {/* Section 1 — Monthly target bar chart */}
      <SectionTitle action={<span className="text-[10px] text-fg-muted">Target: {monthlyTarget}/mo</span>}>
        Classes this month
      </SectionTitle>
      {activeStudents.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">📊</span>}
          title="No active students yet"
          body="Add a student to see their progress against the monthly minimum."
        />
      ) : (
        <Card className="mb-6">
          <div className="space-y-3">
            {monthlyProgress.map((row) => {
              const pct = Math.min(100, Math.round((row.done / monthlyTarget) * 100));
              const hit = row.done >= monthlyTarget;
              return (
                <div key={row.studentId} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium truncate min-w-0">{row.name}</div>
                    <div className="text-[11px] text-fg-secondary whitespace-nowrap">
                      {hit ? (
                        <>
                          <span className="text-neon-green font-bold">{row.done} done</span>
                          <span className="ml-1">· ✓ Hit minimum</span>
                        </>
                      ) : (
                        <>
                          <span className="font-bold">{row.done} done</span>
                          <span className="ml-1">
                            · {monthlyTarget - row.done} more to hit minimum
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-bg-base overflow-hidden">
                    <div
                      className="h-full bg-neon-green transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[10px] text-fg-muted">
            <span className="inline-block w-3 h-3 rounded bg-neon-green" />
            <span>Each bar fills toward the {monthlyTarget}-class minimum. Above the minimum shows “Hit minimum”.</span>
          </div>
        </Card>
      )}

      {/* Section 2 — Students ranked by attendance */}
      <SectionTitle>Students ranked</SectionTitle>

      {/* Optional batch filter (applies to ranked list only) */}
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

      {perStudent.length === 0 ? (
        <Card>
          <div className="text-sm text-fg-muted text-center py-4">No attendance records this month yet.</div>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {perStudent.map((s) => (
            <Card key={s.studentId} className="!p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-fg-muted">
                    {s.present}/{s.total} classes
                  </div>
                  <div className={`text-[11px] mt-0.5 ${s.paid > 0 ? 'text-neon-green' : 'text-fg-muted'}`}>
                    {s.paid > 0 ? `₹${s.paid.toLocaleString('en-IN')} paid` : '₹0 paid'}
                  </div>
                </div>
                <Pill color={s.rate >= 80 ? 'green' : s.rate >= 60 ? 'yellow' : 'pink'}>{s.rate}%</Pill>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
