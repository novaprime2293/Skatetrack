import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useStore } from '../data/store';
import { Button, Card, Pill } from '../components/ui';
import { activeRosterStudentIds, formatISODateLong } from '../data/sessions';

export function AttendanceFlowPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const sessions = useStore((s) => s.db.sessions);
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const attendance = useStore((s) => s.db.attendance);
  const bulkSetAttendance = useStore((s) => s.bulkSetAttendance);
  const setAttendance = useStore((s) => s.setAttendance);
  const resetAttendance = useStore((s) => s.resetAttendance);

  const session = sessions.find((s) => s.id === sessionId);
  const batch = session ? batches.find((b) => b.id === session.batchId) : null;

  // Roster for this session's date
  const roster = useMemo(() => {
    if (!session) return [];
    const ids = activeRosterStudentIds(session.batchId, memberships, session.date);
    return ids.map((id) => students.find((s) => s.id === id)).filter(Boolean) as Array<{ id: string; name: string }>;
  }, [session, memberships, students]);

  // Existing attendance for this session
  const existing = useMemo(() => {
    return new Map(attendance.filter((a) => a.sessionId === sessionId).map((a) => [a.studentId, a.status]));
  }, [attendance, sessionId]);

  // Track marks in component state (so user can review before commit)
  const [marks, setMarks] = useState<Map<string, 'present' | 'absent'>>(new Map(existing));
  const [phase, setPhase] = useState<'marking' | 'review'>('marking');
  const [cardIndex, setCardIndex] = useState(0);

  // Reset card index when session changes
  useEffect(() => {
    setCardIndex(0);
    setMarks(new Map(existing));
    setPhase('marking');
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !batch) {
    return (
      <div className="min-h-screen bg-bg-base text-fg-primary p-6">
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🤔</div>
          <h2 className="text-xl font-bold">Session not found</h2>
          <Button onClick={() => navigate('/')} className="mt-6">Go home</Button>
        </div>
      </div>
    );
  }

  const currentStudent = roster[cardIndex];
  const total = roster.length;
  const presentCount = [...marks.values()].filter((v) => v === 'present').length;
  const absentCount = [...marks.values()].filter((v) => v === 'absent').length;

  const handleMark = (status: 'present' | 'absent') => {
    if (!currentStudent) return;
    const next = new Map(marks);
    next.set(currentStudent.id, status);
    setMarks(next);
    // Auto-advance if not last
    if (cardIndex < total - 1) {
      setCardIndex(cardIndex + 1);
    } else {
      setPhase('review');
    }
  };

  const handleSkip = () => {
    // Skip = leave unmarked, advance
    if (cardIndex < total - 1) {
      setCardIndex(cardIndex + 1);
    } else {
      setPhase('review');
    }
  };

  const handleUndo = () => {
    if (cardIndex > 0) {
      setCardIndex(cardIndex - 1);
    }
  };

  const handleConfirm = () => {
    const records = roster.map((s) => ({
      studentId: s.id,
      status: marks.get(s.id) ?? 'absent', // unmarked = absent (safer)
    }));
    // Actually, only commit marked ones. For unmarked, skip the record so they remain "scheduled" for retry.
    // For v1 simplicity: unmarked → absent (so the teacher knows). This is a product decision noted.
    bulkSetAttendance(session.id, records);
    navigate(`/students?date=${session.date}`);
  };

  const handleSaveProgress = () => {
    // Save what's marked so far, leave the rest pending
    const records = [...marks.entries()].map(([studentId, status]) => ({ studentId, status }));
    if (records.length > 0) {
      // Use bulkSet which replaces; we need to preserve unmarked. Use setAttendance per record.
      for (const r of records) setAttendance(session.id, r.studentId, r.status);
    }
    navigate(`/students?date=${session.date}`);
  };

  const handleReset = () => {
    if (confirm(`Reset all attendance for this session?`)) {
      resetAttendance(session.id);
      setMarks(new Map());
      setCardIndex(0);
      setPhase('marking');
    }
  };

  const sessionStatus = session.status;

  if (phase === 'review') {
    return (
      <div className="min-h-screen bg-bg-base text-fg-primary flex flex-col">
        <div className="px-4 pt-6 pb-4 max-w-2xl w-full mx-auto">
          <button onClick={() => { setPhase('marking'); }} className="text-sm text-fg-muted hover:text-fg-secondary mb-2">← Back to marking</button>
          <h1 className="text-2xl font-bold tracking-tight">Review</h1>
          <p className="text-sm text-fg-secondary mt-1">{batch.name} · {formatISODateLong(session.date)}</p>
        </div>

        <div className="flex-1 max-w-2xl w-full mx-auto px-4 pb-32">
          <Card className="mb-4 stripe-accent">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-3xl font-extrabold neon-text-green">{presentCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-fg-muted mt-1">Present</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold neon-text-pink">{absentCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-fg-muted mt-1">Absent</div>
              </div>
              <div>
                <div className="text-3xl font-extrabold text-fg-muted">{total - presentCount - absentCount}</div>
                <div className="text-[10px] uppercase tracking-wider text-fg-muted mt-1">Skipped</div>
              </div>
            </div>
          </Card>

          {roster.map((s) => {
            const status = marks.get(s.id);
            return (
              <div key={s.id} className="flex items-center justify-between bg-bg-card border border-border rounded-xl px-4 py-2.5 mb-1.5">
                <span className="font-medium">{s.name}</span>
                {status ? (
                  <Pill color={status === 'present' ? 'green' : 'pink'}>
                    {status === 'present' ? 'Present' : 'Absent'}
                  </Pill>
                ) : (
                  <Pill color="muted">Skipped</Pill>
                )}
              </div>
            );
          })}

          <div className="text-xs text-fg-muted mt-3 text-center">
            Skipped students will be marked absent on confirm. To fix later, open this session again.
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 bg-bg-elevated border-t border-border p-4">
          <div className="max-w-2xl mx-auto flex gap-2">
            <Button variant="ghost" onClick={handleReset}>Reset</Button>
            <Button variant="secondary" onClick={handleSaveProgress} className="flex-1">Save draft</Button>
            <Button onClick={handleConfirm} className="flex-1">Confirm</Button>
          </div>
        </div>
      </div>
    );
  }

  // Marking phase
  return (
    <div className="min-h-screen bg-bg-base text-fg-primary flex flex-col">
      <div className="px-4 pt-6 pb-2 max-w-2xl w-full mx-auto w-full">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => navigate(`/students?date=${session.date}`)} className="text-sm text-fg-muted hover:text-fg-secondary">← Exit</button>
          <Pill color={sessionStatus === 'cancelled' ? 'muted' : 'yellow'}>
            {sessionStatus === 'cancelled' ? 'Cancelled' : sessionStatus === 'attendance_marked' ? 'Editing' : 'Pending'}
          </Pill>
        </div>
        <div className="text-xs text-fg-muted uppercase tracking-wider font-bold">{batch.name}</div>
        <div className="text-lg font-bold">{formatISODateLong(session.date)}</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 max-w-md w-full mx-auto">
        {total === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">👥</div>
            <h2 className="text-xl font-bold">No students in this batch</h2>
            <p className="text-sm text-fg-secondary mt-2">Add students to {batch.name} from the Batches tab.</p>
            <Button onClick={() => navigate('/batches')} className="mt-6">Go to Batches</Button>
          </div>
        ) : currentStudent ? (
          <SwipeCard
            key={currentStudent.id}
            student={currentStudent}
            index={cardIndex}
            total={total}
            onSwipe={handleMark}
            onSkip={handleSkip}
            onUndo={handleUndo}
            canUndo={cardIndex > 0}
          />
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-xl font-bold">All done</h2>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-bg-elevated border-t border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between text-xs text-fg-muted">
          <span><span className="text-neon-green font-bold">{presentCount}</span> present</span>
          <span><span className="text-neon-pink font-bold">{absentCount}</span> absent</span>
          <span>{cardIndex + 1} / {total}</span>
        </div>
      </div>
    </div>
  );
}

function SwipeCard({
  student,
  index,
  total,
  onSwipe,
  onSkip,
  onUndo,
  canUndo,
}: {
  student: { id: string; name: string };
  index: number;
  total: number;
  onSwipe: (status: 'present' | 'absent') => void;
  onSkip: () => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 0, 200], [-15, 0, 15]);
  const presentOpacity = useTransform(x, [0, 100], [0, 1]);
  const absentOpacity = useTransform(x, [-100, 0], [1, 0]);
  const bgGlow = useTransform(x, [-200, 0, 200], ['rgba(255,46,147,0.3)', 'rgba(0,0,0,0)', 'rgba(57,255,20,0.3)']);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x > 120) {
      onSwipe('present');
    } else if (info.offset.x < -120) {
      onSwipe('absent');
    } else {
      // snap back
      x.set(0);
    }
  };

  const handleButton = (status: 'present' | 'absent') => {
    onSwipe(status);
  };

  return (
    <div className="w-full">
      <div className="text-center text-xs text-fg-muted uppercase tracking-wider font-bold mb-3">
        {index + 1} of {total}
      </div>
      <div className="relative">
        <motion.div
          style={{ x, rotate, background: bgGlow }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.7}
          onDragEnd={handleDragEnd}
          className="bg-bg-card border-2 border-border rounded-3xl p-8 min-h-[280px] flex flex-col items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <motion.div style={{ opacity: presentOpacity }} className="absolute top-6 right-6 px-3 py-1.5 rounded-full bg-neon-green text-bg-base font-bold text-sm uppercase tracking-wider">Present</motion.div>
          <motion.div style={{ opacity: absentOpacity }} className="absolute top-6 left-6 px-3 py-1.5 rounded-full bg-neon-pink text-bg-base font-bold text-sm uppercase tracking-wider">Absent</motion.div>
          <div className="w-24 h-24 rounded-full bg-bg-elevated border-2 border-border-strong flex items-center justify-center text-4xl font-extrabold mb-4">
            {student.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-2xl font-bold text-center">{student.name}</div>
        </motion.div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <Button variant="ghost" onClick={onUndo} disabled={!canUndo} className="!py-3">↶ Undo</Button>
        <Button variant="danger" onClick={() => handleButton('absent')} className="!py-4">✗ Absent</Button>
        <Button onClick={() => handleButton('present')} className="!py-4">✓ Present</Button>
      </div>
      <button onClick={onSkip} className="w-full text-xs text-fg-muted uppercase tracking-wider py-2 mt-1 hover:text-fg-secondary">
        Skip for now
      </button>
    </div>
  );
}
