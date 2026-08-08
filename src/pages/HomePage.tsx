import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, SectionTitle, Pill } from '../components/ui';
import { batchRunsOnDate, findOrCreateRecurringSessions, sessionEnded, isToday } from '../data/sessions';
import { todayISO } from '../data/storage';

export function HomePage() {
  const navigate = useNavigate();
  const teacher = useStore((s) => s.db.teacher);
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const ensureSession = useStore((s) => s.ensureSessionForBatchDate);

  const today = todayISO();
  const activeBatches = batches.filter((b) => !b.archivedAt);
  const activeStudents = students.filter((s) => !s.archivedAt);

  const todaysSessions = useMemo(() => {
    const out: Array<{ batchId: string; batchName: string; sessionId: string; status: string }> = [];
    for (const batch of activeBatches) {
      if (batchRunsOnDate(batch, today)) {
        const sess = ensureSession(batch.id, today);
        out.push({
          batchId: batch.id,
          batchName: batch.name,
          sessionId: sess.id,
          status: sess.status,
        });
      }
    }
    return out;
  }, [activeBatches, today, sessions, ensureSession]);

  const monthStart = today.slice(0, 7) + '-01';
  const sessionsThisMonth = useMemo(() => {
    const out = findOrCreateRecurringSessions(
      // virtual, just to iterate all batches in one pass
      { id: '', teacherId: '', name: '', daysOfWeek: [], startTime: '', endTime: '', createdAt: '' } as never,
      sessions,
      monthStart,
      today
    ).filter((s) => s.batchId) as Array<{ batchId: string }>;
    void out;
    // Manual iteration
    const set = new Set<string>();
    for (const batch of activeBatches) {
      const list = findOrCreateRecurringSessions(batch, sessions, monthStart, today);
      for (const s of list) set.add(s.id);
    }
    return set;
  }, [activeBatches, sessions, monthStart, today]);

  const attendanceRate = useMemo(() => {
    // Overall attendance rate this month, cancelled sessions excluded
    const idList = [...sessionsThisMonth];
    const validSessions = sessions.filter((s) => idList.includes(s.id) && s.status !== 'cancelled');
    if (validSessions.length === 0) return null;
    const total = attendance.filter((a) => validSessions.some((s) => s.id === a.sessionId)).length;
    const present = attendance.filter((a) => a.status === 'present' && validSessions.some((s) => s.id === a.sessionId)).length;
    if (total === 0) return null;
    return Math.round((present / total) * 100);
  }, [sessionsThisMonth, attendance, sessions]);

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

      <div className="grid grid-cols-3 gap-2 mb-6">
        <StatCard label="Students" value={activeStudents.length} />
        <StatCard label="Batches" value={activeBatches.length} />
        <StatCard label="This Month" value={sessionsThisMonth.size} />
      </div>

      {attendanceRate !== null && (
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-fg-muted uppercase tracking-wider font-bold">Attendance this month</div>
              <div className="text-4xl font-extrabold mt-1 neon-text-green">{attendanceRate}%</div>
            </div>
            <div className="text-6xl opacity-30">🛹</div>
          </div>
          <div className="mt-3 h-2 bg-bg-base rounded-full overflow-hidden">
            <div className="h-full bg-neon-green transition-all" style={{ width: `${attendanceRate}%` }} />
          </div>
        </Card>
      )}

      <SectionTitle action={<span className="text-xs text-fg-muted">{today}</span>}>Today's classes</SectionTitle>
      {todaysSessions.length === 0 ? (
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">No classes scheduled today.</div>
        </Card>
      ) : (
        <div className="space-y-2">
          {todaysSessions.map((ts) => (
            <Card key={ts.sessionId} className="flex items-center justify-between" onClick={() => navigate(`/attendance/${ts.sessionId}`)}>
              <div>
                <div className="font-semibold">{ts.batchName}</div>
                <div className="text-xs text-fg-muted mt-0.5">
                  {isToday(ts.sessionId.split('-').slice(0, 3).join('-')) ? 'Today' : 'Scheduled'}
                </div>
              </div>
              <Pill color={ts.status === 'attendance_marked' ? 'green' : ts.status === 'cancelled' ? 'muted' : 'yellow'}>
                {ts.status === 'attendance_marked' ? 'Marked' : ts.status === 'cancelled' ? 'Cancelled' : 'Pending'}
              </Pill>
            </Card>
          ))}
        </div>
      )}

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
