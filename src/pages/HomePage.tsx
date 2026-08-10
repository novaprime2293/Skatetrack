import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, SectionTitle, Pill, Button, Modal, Label, TextInput } from '../components/ui';
import { MonthlyAttendanceGrid } from '../components/MonthlyAttendanceGrid';
import { StudentsPerBatchDonut } from '../components/StudentsPerBatchDonut';
import { batchRunsOnDate, findOrCreateRecurringSessions, sessionEnded, isToday } from '../data/sessions';
import { todayISO } from '../data/storage';

export function HomePage() {
  const navigate = useNavigate();
  const teacher = useStore((s) => s.db.teacher);
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const sessions = useStore((s) => s.db.sessions);
  
  const ensureSession = useStore((s) => s.ensureSessionForBatchDate);
  const addOneOffSession = useStore((s) => s.addOneOffSession);

  const [showAddSpecial, setShowAddSpecial] = useState(false);

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

  // Classes done this month = recurring sessions whose endTime < now (excluding cancelled) +
  // all one-off sessions this month regardless of status. PRD §4.6.
  const classesDone = useMemo(() => {
    const now = new Date();
    const monthStartStr = today.slice(0, 7) + '-01';
    let count = 0;
    for (const sess of sessions) {
      if (!sess.date.startsWith(today.slice(0, 7))) continue; // this month
      if (sess.type === 'one-off') {
        count++;
        continue;
      }
      if (sess.type === 'recurring' && sess.status !== 'cancelled' && sessionEnded(sess, now)) {
        count++;
      }
    }
    void monthStartStr;
    return count;
  }, [sessions, today]);

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
        <StatCard label="Classes done" value={classesDone} />
      </div>

      <MonthlyAttendanceGrid />

      <StudentsPerBatchDonut />

      <SectionTitle
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted">{today}</span>
            {activeBatches.length > 0 && (
              <button
                onClick={() => setShowAddSpecial(true)}
                className="text-xs text-neon-green uppercase tracking-wider font-bold"
              >
                + Add special class
              </button>
            )}
          </div>
        }
      >
        Today's classes
      </SectionTitle>
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

      {showAddSpecial && (
        <AddSpecialClassModal
          activeBatches={activeBatches}
          onClose={() => setShowAddSpecial(false)}
          onCreate={(batchId, date, start, end) => {
            const s = addOneOffSession(batchId, date, start, end);
            setShowAddSpecial(false);
            navigate(`/attendance/${s.id}`);
          }}
        />
      )}
    </div>
  );
}

function AddSpecialClassModal({
  activeBatches,
  onClose,
  onCreate,
}: {
  activeBatches: Array<{ id: string; name: string; startTime: string; endTime: string; daysOfWeek: number[] }>;
  onClose: () => void;
  onCreate: (batchId: string, date: string, start: string, end: string) => void;
}) {
  const [batchId, setBatchId] = useState<string>(activeBatches[0]?.id ?? '');
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState(activeBatches[0]?.startTime ?? '16:00');
  const [end, setEnd] = useState(activeBatches[0]?.endTime ?? '17:00');

  // When user picks a different batch, seed start/end with that batch's normal times.
  const handlePickBatch = (id: string) => {
    setBatchId(id);
    const b = activeBatches.find((bb) => bb.id === id);
    if (b) {
      setStart(b.startTime);
      setEnd(b.endTime);
    }
  };

  if (activeBatches.length === 0) return null;

  return (
    <Modal open onClose={onClose} title="Add special class">
      <div className="space-y-3">
        <div>
          <Label>Which batch?</Label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
            {activeBatches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => handlePickBatch(b.id)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  batchId === b.id ? 'bg-neon-green/10 border-neon-green/50 text-fg-primary' : 'bg-bg-card border-border text-fg-secondary'
                }`}
              >
                <div className="font-medium">{b.name}</div>
                <div className="text-[11px] text-fg-muted">
                  {b.daysOfWeek.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' · ')} · {b.startTime}–{b.endTime}
                </div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label>Date</Label>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Start</Label>
            <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <Label>End</Label>
            <TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onCreate(batchId, date, start, end)} className="flex-1" disabled={!batchId}>
            Add
          </Button>
        </div>
      </div>
    </Modal>
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
