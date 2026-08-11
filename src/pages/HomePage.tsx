import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, SectionTitle } from '../components/ui';
import { MonthlyAttendanceGrid } from '../components/MonthlyAttendanceGrid';
import { batchRunsOnDate, findOrCreateRecurringSessions, getBatchTimeForDay, parseISODate, sessionEnded } from '../data/sessions';
import { todayISO } from '../data/storage';

export function HomePage() {
  const navigate = useNavigate();
  const teacher = useStore((s) => s.db.teacher);
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);

  const today = todayISO();
  const activeBatches = batches.filter((b) => !b.archivedAt);
  const activeStudents = students.filter((s) => !s.archivedAt);

  const pendingCount = useMemo(() => {
    const now = new Date();
    let count = 0;
    for (const batch of activeBatches) {
      const list = findOrCreateRecurringSessions(batch, sessions, today, today);
      for (const s of list) {
        if (s.status === 'scheduled' && sessionEnded(s, now)) count++;
      }
    }
    return count;
  }, [activeBatches, sessions, today]);

  // Classes done this month, per batch. Each batch counts its own classes independently:
  // recurring sessions for that batch whose endTime has passed (excluding cancelled) +
  // one-off sessions for that batch this month. Overlapping dates count once per batch.
  const classesDoneByBatch = useMemo(() => {
    const now = new Date();
    const map = new Map<string, number>();
    for (const batch of activeBatches) {
      let count = 0;
      for (const sess of sessions) {
        if (sess.batchId !== batch.id) continue;
        if (!sess.date.startsWith(today.slice(0, 7))) continue;
        if (sess.type === 'one-off') {
          count++;
          continue;
        }
        if (sess.type === 'recurring' && sess.status !== 'cancelled' && sessionEnded(sess, now)) {
          count++;
        }
      }
      map.set(batch.id, count);
    }
    return map;
  }, [sessions, today, activeBatches]);

  // Today's students widget — groups today's batches by (startTime, endTime) and shows
  // the union of students who have class at each time slot. If two batches share the same
  // day+time, their rosters merge into one list. If no batch runs today, the widget is hidden.
  const todaysClassSlots = useMemo(() => {
    const todayDow = parseISODate(today).getDay();
    const slotsByKey = new Map<string, {
      key: string;
      startTime: string;
      endTime: string;
      batchIds: Set<string>;
      studentIds: Set<string>;
    }>();
    for (const batch of activeBatches) {
      if (!batchRunsOnDate(batch, today)) continue;
      const { startTime, endTime } = getBatchTimeForDay(batch, todayDow);
      const key = `${startTime}|${endTime}`;
      let slot = slotsByKey.get(key);
      if (!slot) {
        slot = { key, startTime, endTime, batchIds: new Set(), studentIds: new Set() };
        slotsByKey.set(key, slot);
      }
      slot.batchIds.add(batch.id);
      for (const m of memberships) {
        if (m.batchId !== batch.id) continue;
        if (m.removedDate !== null) continue;
        if (m.joinedDate > today) continue;
        slot.studentIds.add(m.studentId);
      }
    }
    // Sort by start time, then end time.
    return [...slotsByKey.values()].sort((a, b) =>
      a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime),
    );
  }, [activeBatches, memberships, today]);

  const todaysStudents = useMemo(() => {
    const ids = new Set<string>();
    for (const slot of todaysClassSlots) {
      for (const sid of slot.studentIds) ids.add(sid);
    }
    return [...ids]
      .map((id) => activeStudents.find((s) => s.id === id))
      .filter((s): s is NonNullable<typeof s> => Boolean(s))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [todaysClassSlots, activeStudents]);

  return (
    <div className="px-4 pb-12">
      <PageHeader
        title={`Hey, ${teacher.name} 👋`}
        subtitle={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
      />

      {pendingCount > 0 && (
        <Card className="mb-4 border-neon-pink/40 stripe-accent cursor-pointer" onClick={() => navigate('/')}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-neon-pink font-bold">Pending</div>
              <div className="text-lg font-bold mt-0.5">{pendingCount} class{pendingCount === 1 ? '' : 'es'} need attendance</div>
            </div>
            <div className="text-neon-pink text-2xl">→</div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 mb-6">
        <StatCard label="Students" value={activeStudents.length} />
        <StatCard label="Batches" value={activeBatches.length} />
      </div>

      {activeBatches.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-3">Classes done · this month</h2>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1">
            {activeBatches.map((b) => (
              <div
                key={b.id}
                className="bg-bg-card border border-border rounded-2xl p-3 min-w-[120px] flex-shrink-0 text-center"
              >
                <div className="text-2xl font-extrabold neon-text-green">{classesDoneByBatch.get(b.id) ?? 0}</div>
                <div className="text-[10px] text-fg-muted uppercase tracking-wider mt-1 truncate">{b.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's students widget — only renders when there's at least one class slot today. */}
      {todaysClassSlots.length > 0 && (
        <div className="mb-6">
          <SectionTitle
            action={<span className="text-xs text-fg-muted">{today}</span>}
          >
            Today's students
          </SectionTitle>
          <div className="space-y-2">
            {todaysClassSlots.map((slot) => {
              const studentsInSlot = [...slot.studentIds]
                .map((id) => activeStudents.find((s) => s.id === id))
                .filter((s): s is NonNullable<typeof s> => Boolean(s))
                .sort((a, b) => a.name.localeCompare(b.name));
              const batchNames = [...slot.batchIds]
                .map((id) => activeBatches.find((b) => b.id === id)?.name)
                .filter(Boolean)
                .join(' + ');
              return (
                <Card key={slot.key}>
                  <div className="flex items-baseline justify-between gap-2 mb-2">
                    <div className="text-sm font-semibold">
                      {slot.startTime}–{slot.endTime}
                    </div>
                    <div className="text-[10px] text-fg-muted uppercase tracking-wider truncate">
                      {batchNames}
                    </div>
                  </div>
                  {studentsInSlot.length === 0 ? (
                    <div className="text-xs text-fg-muted py-2">No students enrolled yet.</div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {studentsInSlot.map((s) => (
                        <span
                          key={s.id}
                          className="bg-bg-base border border-border rounded-full px-2.5 py-1 text-xs text-fg-primary"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
          {todaysStudents.length > 0 && (
            <div className="text-[10px] text-fg-muted uppercase tracking-wider mt-2 text-right">
              {todaysStudents.length} student{todaysStudents.length === 1 ? '' : 's'} across {todaysClassSlots.length} class{todaysClassSlots.length === 1 ? '' : 'es'}
            </div>
          )}
        </div>
      )}

      <MonthlyAttendanceGrid />

      <div className="mt-6">
        <button
          onClick={() => navigate('/settings')}
          className="w-full text-xs text-fg-muted uppercase tracking-wider py-2 hover:text-fg-secondary"
        >
          Settings & backup →
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="text-center !p-3">
      <div className="text-2xl font-extrabold neon-text-green">{value}</div>
      <div className="text-[10px] text-fg-muted uppercase tracking-wider mt-1">{label}</div>
    </Card>
  );
}