import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { findOrCreateRecurringSessions, parseISODate } from '../data/sessions';
import { Card } from './ui';

type Cell = 'present' | 'absent' | 'mixed' | 'none';

function computeCell(
  studentId: string,
  date: string,
  sessions: ReturnType<typeof useStore.getState>['db']['sessions'],
  attendance: ReturnType<typeof useStore.getState>['db']['attendance'],
  studentBatchIds: Set<string>,
): Cell {
  const sessionsOnDate = sessions.filter(
    (s) => s.date === date && studentBatchIds.has(s.batchId) && s.status !== 'cancelled',
  );
  if (sessionsOnDate.length === 0) return 'none';
  const records = sessionsOnDate
    .map((sess) => attendance.find((a) => a.sessionId === sess.id && a.studentId === studentId)?.status ?? null)
    .filter((x): x is 'present' | 'absent' => x !== null);
  if (records.length === 0) return 'none';
  const hasPresent = records.includes('present');
  const hasAbsent = records.includes('absent');
  if (hasPresent && hasAbsent) return 'mixed';
  if (hasPresent) return 'present';
  return 'absent';
}

function cellLabel(c: Cell): string {
  if (c === 'present') return 'G';
  if (c === 'absent') return 'R';
  if (c === 'mixed') return 'M';
  return '';
}

function cellClasses(c: Cell): string {
  if (c === 'present') return 'bg-neon-green text-bg-base';
  if (c === 'absent') return 'bg-neon-pink text-bg-base';
  if (c === 'mixed') return 'bg-gradient-to-r from-neon-green from-50% via-bg-card via-50% to-neon-pink text-bg-base';
  return 'bg-bg-card text-fg-muted';
}

export function MonthlyAttendanceGrid() {
  const navigate = useNavigate();
  const students = useStore((s) => s.db.students);
  const batches = useStore((s) => s.db.batches);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

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

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Active students (alphabetical) with their batch-id set.
  const studentRows = useMemo(() => {
    const active = students.filter((s) => !s.archivedAt);
    active.sort((a, b) => a.name.localeCompare(b.name));
    return active.map((s) => {
      const studentBatchIds = new Set(
        memberships
          .filter((m) => m.studentId === s.id && m.removedDate === null)
          .map((m) => m.batchId),
      );
      return { id: s.id, name: s.name, batchIds: studentBatchIds };
    });
  }, [students, memberships]);

  // For each day, pre-compute the set of sessions that day (across batches the student is in).
  // Build a map { date -> Session[] } of all sessions in the month for all active batches.
  const monthSessionsByDate = useMemo(() => {
    const fromStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const toStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const map = new Map<string, ReturnType<typeof useStore.getState>['db']['sessions']>();
    const activeBatches = batches.filter((b) => !b.archivedAt);
    for (const batch of activeBatches) {
      const list = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr);
      for (const sess of list) {
        // For real sessions, prefer the stored one; virtual entries have id starting with 'virtual-'.
        const real = sess.id.startsWith('virtual-')
          ? sessions.find((s) => s.batchId === batch.id && s.date === sess.date && s.type === 'recurring')
          : sess;
        if (!real) continue;
        const arr = map.get(sess.date) ?? [];
        arr.push(real);
        map.set(sess.date, arr);
      }
    }
    return map;
  }, [batches, sessions, viewYear, viewMonth, daysInMonth]);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Monthly attendance</h2>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} aria-label="Previous month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">‹</button>
          <button onClick={goToday} disabled={isCurrentMonth} className="text-[10px] uppercase tracking-wider font-bold text-neon-green disabled:opacity-40 disabled:cursor-default">Today</button>
          <button onClick={goNext} aria-label="Next month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">›</button>
        </div>
      </div>
      <div className="text-sm font-semibold mb-3">{monthLabel}</div>

      {studentRows.length === 0 ? (
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">Add students to see the monthly snapshot.</div>
        </Card>
      ) : (
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
          <div className="min-w-[640px]">
            <div
              className="grid mb-1"
              style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(18px, 1fr))` }}
            >
              <div />
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <div key={d} className="text-center text-[9px] text-fg-muted">{d}</div>
              ))}
            </div>
            {studentRows.map((row) => {
              const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
              return (
                <div
                  key={row.id}
                  className="grid items-center"
                  style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(18px, 1fr))` }}
                >
                  <button
                    onClick={() => navigate(`/students/${row.id}`)}
                    className="text-[11px] text-fg-secondary truncate pr-2 text-left hover:text-fg-primary"
                  >
                    {row.name}
                  </button>
                  {days.map((d) => {
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    const c = computeCell(row.id, dateStr, monthSessionsByDate.get(dateStr) ?? [], attendance, row.batchIds);
                    // Need a date-scoped session set that actually matches what computeCell receives.
                    // We pass monthSessionsByDate.get(dateStr) which is the full set for that date across all batches.
                    const sessionCount = (monthSessionsByDate.get(dateStr) ?? []).filter((s) => row.batchIds.has(s.batchId)).length;
                    if (c === 'none' || sessionCount === 0) {
                      return <div key={d} className="h-6 mx-0.5 rounded bg-bg-card opacity-50" />;
                    }
                    return (
                      <button
                        key={d}
                        onClick={() => navigate(`/students/${row.id}?date=${dateStr}`)}
                        className={`h-6 mx-0.5 rounded ${cellClasses(c)} flex items-center justify-center text-[10px] font-bold active:scale-95`}
                        title={`${row.name} · ${parseISODate(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${c}`}
                      >
                        {cellLabel(c)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-3 mt-3 text-[10px] uppercase tracking-wider text-fg-muted">
        <div className="flex items-center gap-1"><span className="font-bold text-neon-green">G</span>All present</div>
        <div className="flex items-center gap-1"><span className="font-bold text-neon-pink">R</span>All absent</div>
        <div className="flex items-center gap-1"><span className="font-bold">M</span>Mixed</div>
      </div>
    </div>
  );
}