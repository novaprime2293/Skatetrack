// TEMPORARY debug page — dumps the IndexedDB as JSON so I can see the actual data
// when something looks wrong. Will be removed once the phantom-row bug is fixed.
//
// Navigate to /debug to see the dump. Each section shows summary stats + JSON.

import { useStore } from '../data/store';
import { useMemo } from 'react';

export function DebugPage() {
  const db = useStore((s) => s.db);
  const sessions = db.sessions;
  const attendance = db.attendance;
  const batches = db.batches;
  const students = db.students;
  const memberships = db.memberships;

  // Suspected phantom markers — flag rows that look like accidental / inconsistent data.
  const suspicions = useMemo(() => {
    const out: Array<{ severity: 'red' | 'yellow'; message: string }> = [];

    // Build a session lookup map.
    const sessById = new Map(sessions.map((s) => [s.id, s]));

    // Sentinel dates: anything on Aug 1 / Aug 2, 2026 in a weekend-pattern batch.

    for (const sess of sessions) {
      const batch = batches.find((b) => b.id === sess.batchId);
      if (!batch) continue;
      const isWeekendPattern = batch.daysOfWeek.includes(0) || batch.daysOfWeek.includes(6);
      const isAug1or2 = (() => {
        const [y, m, d] = sess.date.split('-').map(Number);
        return y === 2026 && m === 8 && (d === 1 || d === 2);
      })();
      const sessRows = attendance.filter((a) => a.sessionId === sess.id);
      if (isWeekendPattern && isAug1or2) {
        out.push({
          severity: 'red',
          message: `Aug 1/2 weekend session: ${batch.name} on ${sess.date} (${sessRows.length} attendance row${sessRows.length === 1 ? '' : 's'})`,
        });
      }
      // Orphaned attendance rows.
      if (sess.status === 'attendance_marked' && sessRows.length === 0) {
        out.push({
          severity: 'yellow',
          message: `Session marked but has 0 attendance rows: ${batch.name} on ${sess.date}`,
        });
      }
    }

    // Orphan attendance rows (point to non-existent sessions).
    for (const att of attendance) {
      if (!sessById.has(att.sessionId)) {
        out.push({
          severity: 'red',
          message: `Orphan attendance row: sessionId=${att.sessionId} (${att.status})`,
        });
      }
    }

    return out;
  }, [sessions, attendance, batches]);

  return (
    <div className="px-4 py-6 pb-24 text-fg-primary">
      <h1 className="text-2xl font-bold mb-2">DB Debug</h1>
      <p className="text-xs text-fg-muted mb-6">
        Temporary page — dumps the entire IndexedDB as JSON. Forward this to me if anything looks wrong.
      </p>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">Suspected phantoms</h2>
        {suspicions.length === 0 ? (
          <div className="text-xs text-fg-muted">None flagged.</div>
        ) : (
          <ul className="space-y-1">
            {suspicions.map((s, i) => (
              <li
                key={i}
                className={
                  s.severity === 'red'
                    ? 'text-xs text-neon-pink border border-neon-pink/40 rounded p-2'
                    : 'text-xs text-neon-orange border border-neon-orange/40 rounded p-2'
                }
              >
                {s.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">
          Attendance ({attendance.length})
        </h2>
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
          <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
            {JSON.stringify(attendance, null, 2)}
          </pre>
        </details>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">Sessions ({sessions.length})</h2>
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
          <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
            {JSON.stringify(sessions, null, 2)}
          </pre>
        </details>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">Batches ({batches.length})</h2>
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
          <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
            {JSON.stringify(batches, null, 2)}
          </pre>
        </details>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">Students ({students.length})</h2>
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
          <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
            {JSON.stringify(students, null, 2)}
          </pre>
        </details>
      </section>

      <section className="mb-6">
        <h2 className="text-sm font-bold mb-2">
          Memberships ({memberships.length})
        </h2>
        <details>
          <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
          <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
            {JSON.stringify(memberships, null, 2)}
          </pre>
        </details>
      </section>

      <h2 className="text-sm font-bold mb-2 mt-6">Full DB snapshot</h2>
      <details>
        <summary className="text-xs text-fg-muted cursor-pointer">Show JSON</summary>
        <pre className="text-[10px] bg-bg-card border border-border rounded p-2 overflow-x-auto mt-2">
          {JSON.stringify(db, null, 2)}
        </pre>
      </details>
    </div>
  );
}
