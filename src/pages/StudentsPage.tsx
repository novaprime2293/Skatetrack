import { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, TextInput, Label, Pill, EmptyState } from '../components/ui';
import { findOrCreateRecurringSessions, batchRunsOnDate, formatISODate } from '../data/sessions';
import { todayISO } from '../data/storage';

export function StudentsPage() {
  const { studentId } = useParams<{ studentId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const batches = useStore((s) => s.db.batches);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const ensureSession = useStore((s) => s.ensureSessionForBatchDate);
  const addStudent = useStore((s) => s.addStudent);
  const updateStudent = useStore((s) => s.updateStudent);
  const archiveStudent = useStore((s) => s.archiveStudent);
  const addMembership = useStore((s) => s.addMembership);

  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [pickBatchFor, setPickBatchFor] = useState<{ studentId: string; candidateBatchIds: string[] } | null>(null);

  // Date is in URL so it survives navigation
  const markDate = searchParams.get('date') ?? todayISO();
  const setMarkDate = (d: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('date', d);
    setSearchParams(next, { replace: true });
  };

  const activeBatches = useMemo(() => batches.filter((b) => !b.archivedAt), [batches]);

  const activeStudents = students.filter((s) => !s.archivedAt);
  const visible = useMemo(() => {
    let list = activeStudents;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }
    if (batchFilter) {
      const inBatch = new Set(memberships.filter((m) => m.batchId === batchFilter && m.removedDate === null).map((m) => m.studentId));
      list = list.filter((s) => inBatch.has(s.id));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [activeStudents, search, batchFilter, memberships]);

  const selected = studentId ? students.find((s) => s.id === studentId) : null;

  // For a given student + date, find which batches they belong to AND that batch runs on that date.
  const getScheduledBatchesForStudent = (studentId: string, date: string) => {
    const studentMemberships = memberships.filter(
      (m) => m.studentId === studentId && m.removedDate === null && m.joinedDate <= date
    );
    return activeBatches.filter(
      (b) => studentMemberships.some((m) => m.batchId === b.id) && batchRunsOnDate(b, date)
    );
  };

  // Already-marked attendance for (student, date) per batch
  const attendanceStatusFor = (studentId: string, date: string) => {
    const sessionsOnDate = sessions.filter((s) => s.date === date);
    const records = sessionsOnDate
      .map((sess) => {
        const rec = attendance.find((a) => a.sessionId === sess.id && a.studentId === studentId);
        return rec?.status ?? null;
      })
      .filter((x): x is 'present' | 'absent' => x !== null);
    return records;
  };

  const handleMarkClick = (studentId: string) => {
    const candidates = getScheduledBatchesForStudent(studentId, markDate);
    if (candidates.length === 0) {
      // No batch sched for this student on this date — give a clear message
      alert(`No batch scheduled for this student on ${formatISODate(markDate)}. Pick a different date or add a one-off session.`);
      return;
    }
    if (candidates.length === 1) {
      const sess = ensureSession(candidates[0].id, markDate);
      navigate(`/attendance/${sess.id}`);
      return;
    }
    // Multiple batches — let the user pick
    setPickBatchFor({ studentId, candidateBatchIds: candidates.map((b) => b.id) });
  };

  const handlePickBatch = (batchId: string) => {
    if (!pickBatchFor) return;
    const sess = ensureSession(batchId, markDate);
    setPickBatchFor(null);
    navigate(`/attendance/${sess.id}`);
  };

  return (
    <div className="px-4 pb-12">
      <PageHeader
        title="Students"
        subtitle={`${activeStudents.length} active`}
        action={<Button size="sm" onClick={() => setShowCreate(true)}>+ New</Button>}
      />

      <div className="mb-3">
        <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name…" />
      </div>

      {/* Mark-attendance date picker */}
      <Card className="mb-3 !p-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-fg-muted uppercase tracking-wider font-bold mb-1">Marking for</div>
            <input
              type="date"
              value={markDate}
              onChange={(e) => setMarkDate(e.target.value)}
              max="2099-12-31"
              className="w-full bg-bg-base border border-border rounded-lg px-3 py-1.5 text-sm text-fg-primary focus:outline-none focus:border-neon-green"
            />
          </div>
          <button
            onClick={() => setMarkDate(todayISO())}
            className="text-xs text-neon-green uppercase tracking-wider font-bold px-2 py-1 mt-4"
          >
            Today
          </button>
        </div>
      </Card>

      <div className="mb-4 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
        <button
          onClick={() => setBatchFilter(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
            batchFilter === null ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary'
          }`}
        >
          All
        </button>
        {activeBatches.map((b) => (
          <button
            key={b.id}
            onClick={() => setBatchFilter(b.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
              batchFilter === b.id ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary'
            }`}
          >
            {b.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">👤</span>}
          title={activeStudents.length === 0 ? 'No students yet' : 'No matches'}
          body={activeStudents.length === 0 ? 'Add a student to get started.' : 'Try a different name or batch filter.'}
          action={activeStudents.length === 0 ? <Button onClick={() => setShowCreate(true)}>Add your first student</Button> : null}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((s) => {
            const studentBatches = memberships.filter((m) => m.studentId === s.id && m.removedDate === null);
            const scheduled = getScheduledBatchesForStudent(s.id, markDate);
            const attendanceList = attendanceStatusFor(s.id, markDate);
            const markedCount = attendanceList.length;
            const presentCount = attendanceList.filter((x) => x === 'present').length;
            const canMark = scheduled.length > 0;
            return (
              <Card key={s.id} className="!p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/students/${s.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="font-semibold truncate">{s.name}</div>
                    <div className="text-xs text-fg-muted mt-0.5">
                      {studentBatches.length === 0 ? 'No batches' : `${studentBatches.length} batch${studentBatches.length === 1 ? '' : 'es'}`}
                      {markedCount > 0 && (
                        <span className="ml-2">
                          · {presentCount}/{markedCount} marked
                        </span>
                      )}
                    </div>
                    {scheduled.length > 0 && (
                      <div className="text-[10px] text-neon-green uppercase tracking-wider font-bold mt-1">
                        {scheduled.length === 1 ? scheduled[0].name : `${scheduled.length} batches`} scheduled {formatISODate(markDate)}
                      </div>
                    )}
                  </button>
                  <Button
                    size="sm"
                    variant={canMark ? 'primary' : 'ghost'}
                    onClick={() => handleMarkClick(s.id)}
                    disabled={!canMark}
                    className="!px-3 !py-2 !text-xs"
                  >
                    {markedCount > 0 ? 'Edit' : 'Mark'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateStudentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => {
          const s = addStudent(input);
          setShowCreate(false);
          if (batchFilter) addMembership(batchFilter, s.id);
        }}
      />

      {selected && (
        <Modal open onClose={() => navigate('/students')} title={selected.name}>
          <StudentDetail
            student={selected}
            onSave={(patch) => {
              updateStudent(selected.id, patch);
              navigate('/students');
            }}
            onArchive={() => {
              if (confirm(`Archive ${selected.name}? Past attendance stays intact.`)) {
                archiveStudent(selected.id);
                navigate('/students');
              }
            }}
          />
        </Modal>
      )}

      {pickBatchFor && (
        <Modal open onClose={() => setPickBatchFor(null)} title="Which batch?">
          <div className="space-y-2">
            <p className="text-sm text-fg-secondary mb-2">
              This student is in multiple batches that meet on {formatISODate(markDate)}. Pick one to mark attendance for:
            </p>
            {pickBatchFor.candidateBatchIds.map((bid) => {
              const b = batches.find((bb) => bb.id === bid);
              if (!b) return null;
              return (
                <button
                  key={bid}
                  onClick={() => handlePickBatch(bid)}
                  className="w-full text-left bg-bg-card border border-border rounded-xl px-4 py-3 hover:bg-bg-card-hover"
                >
                  <div className="font-semibold">{b.name}</div>
                  <div className="text-xs text-fg-muted mt-0.5">
                    {b.daysOfWeek.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(' · ')} · {b.startTime}–{b.endTime}
                  </div>
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function CreateStudentModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (input: { name: string; parentContact?: string; dateJoined: string }) => void }) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  if (!open) return null;

  return (
    <Modal open onClose={() => { setName(''); setParent(''); onClose(); }} title="New student">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav Sharma" />
        </div>
        <div>
          <Label>Parent contact (optional)</Label>
          <TextInput value={parent} onChange={(e) => setParent(e.target.value)} placeholder="phone or email" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={() => { setName(''); setParent(''); onClose(); }} className="flex-1">Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onCreate({
                name: name.trim(),
                parentContact: parent.trim() || undefined,
                dateJoined: todayISO(),
              });
              setName('');
              setParent('');
            }}
            className="flex-1"
          >
            Add
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function StudentDetail({ student, onSave, onArchive }: { student: { id: string; name: string; parentContact?: string; dateJoined: string }; onSave: (patch: { name: string; parentContact?: string }) => void; onArchive: () => void }) {
  const memberships = useStore((s) => s.db.memberships);
  const batches = useStore((s) => s.db.batches);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);

  const [name, setName] = useState(student.name);
  const [parent, setParent] = useState(student.parentContact ?? '');

  const studentBatches = memberships.filter((m) => m.studentId === student.id && m.removedDate === null);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const classDates = new Set<string>();
  for (const m of studentBatches) {
    const batch = batches.find((b) => b.id === m.batchId);
    if (!batch) continue;
    const fromStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const toStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const list = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr);
    for (const s of list) classDates.add(s.date);
  }

  const attendanceForDate = (date: string): 'present' | 'absent' | null => {
    const sessionsOnDate = sessions.filter((s) => s.date === date && studentBatches.some((m) => m.batchId === m.batchId && m.removedDate === null));
    for (const sess of sessionsOnDate) {
      const a = attendance.find((att) => att.sessionId === sess.id && att.studentId === student.id);
      if (a) return a.status;
    }
    return null;
  };

  return (
    <div className="space-y-5">
      <div>
        <Label>Name</Label>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label>Parent contact</Label>
        <TextInput value={parent} onChange={(e) => setParent(e.target.value)} placeholder="phone or email" />
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-2">Batches</h4>
        {studentBatches.length === 0 ? (
          <div className="text-sm text-fg-muted">Not in any batch yet.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {studentBatches.map((m) => {
              const b = batches.find((bb) => bb.id === m.batchId);
              return <Pill key={m.batchId}>{b?.name ?? '?'}</Pill>;
            })}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-2">
          {firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </h4>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-fg-muted mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: startWeekday }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const hadClass = classDates.has(iso);
            const status = attendanceForDate(iso);
            let bg = 'bg-bg-card';
            if (hadClass) {
              if (status === 'present') bg = 'bg-neon-green';
              else if (status === 'absent') bg = 'bg-neon-pink';
              else bg = 'bg-bg-card border border-border';
            }
            return (
              <div key={iso} className={`aspect-square rounded-md ${bg} flex items-center justify-center text-xs font-bold ${status ? 'text-bg-base' : hadClass ? 'text-fg-secondary' : 'text-fg-muted'}`}>
                {day}
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-3 text-[10px] uppercase tracking-wider text-fg-muted">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-green" />Present</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-pink" />Absent</div>
        </div>
      </div>

      <div className="border-t border-border pt-4 flex gap-2">
        <Button variant="ghost" onClick={onArchive}>Archive</Button>
        <Button
          onClick={() => onSave({ name: name.trim(), parentContact: parent.trim() || undefined })}
          disabled={!name.trim()}
          className="flex-1"
        >
          Save
        </Button>
      </div>
    </div>
  );
}
