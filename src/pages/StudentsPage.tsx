import { useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, TextInput, Label, Pill, EmptyState } from '../components/ui';
import { findOrCreateRecurringSessions, batchRunsOnDate, formatISODate, formatISODateLong, parseISODate } from '../data/sessions';
import { todayISO } from '../data/storage';
import { DAY_NAMES } from '../data/types';

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
        batches={activeBatches}
        defaultBatchId={batchFilter}
        onCreate={(input, batchId) => {
          const s = addStudent(input);
          if (batchId) addMembership(batchId, s.id);
          setShowCreate(false);
        }}
      />

      {selected && (
        <Modal open onClose={() => navigate('/students')} title={selected.name}>
          <StudentDetail
            student={selected}
            initialDate={searchParams.get('date')}
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

function CreateStudentModal({
  open,
  onClose,
  onCreate,
  batches,
  defaultBatchId,
}: {
  open: boolean;
  onClose: () => void;
  batches: Array<{ id: string; name: string }>;
  defaultBatchId: string | null;
  onCreate: (input: { name: string; parentContact?: string; dateJoined: string }, batchId: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [batchId, setBatchId] = useState<string | null>(defaultBatchId);

  // Reset whenever the modal re-opens with a (possibly new) default
  useMemo(() => {
    if (open) setBatchId(defaultBatchId);
  }, [open, defaultBatchId]);

  if (!open) return null;

  return (
    <Modal
      open
      onClose={() => { setName(''); setParent(''); setBatchId(defaultBatchId); onClose(); }}
      title="New student"
    >
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aarav Sharma" />
        </div>
        <div>
          <Label>Parent contact (optional)</Label>
          <TextInput value={parent} onChange={(e) => setParent(e.target.value)} placeholder="phone or email" />
        </div>
        <div>
          <Label>Add to a batch</Label>
          <p className="text-xs text-fg-muted mb-2">Pick one now — you can add more later.</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-hide">
            <button
              type="button"
              onClick={() => setBatchId(null)}
              className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                batchId === null ? 'bg-neon-green/10 border-neon-green/50 text-fg-primary' : 'bg-bg-card border-border text-fg-secondary'
              }`}
            >
              Skip for now
            </button>
            {batches.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBatchId(b.id)}
                className={`w-full text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                  batchId === b.id ? 'bg-neon-green/10 border-neon-green/50 text-fg-primary' : 'bg-bg-card border-border text-fg-secondary'
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => { setName(''); setParent(''); setBatchId(defaultBatchId); onClose(); }}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              onCreate(
                {
                  name: name.trim(),
                  parentContact: parent.trim() || undefined,
                  dateJoined: todayISO(),
                },
                batchId,
              );
              setName('');
              setParent('');
              setBatchId(defaultBatchId);
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

function ManageBatchesModal({
  open,
  onClose,
  studentId,
  studentName,
}: {
  open: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
}) {
  const batches = useStore((s) => s.db.batches);
  const memberships = useStore((s) => s.db.memberships);
  const addMembership = useStore((s) => s.addMembership);
  const removeMembership = useStore((s) => s.removeMembership);

  if (!open) return null;

  const activeBatches = batches.filter((b) => !b.archivedAt);
  const currentBatches = memberships.filter((m) => m.studentId === studentId && m.removedDate === null);
  const currentBatchIds = new Set(currentBatches.map((m) => m.batchId));
  const eligible = activeBatches.filter((b) => !currentBatchIds.has(b.id));

  const handleAdd = (batchId: string) => {
    addMembership(batchId, studentId);
  };
  const handleRemove = (batchId: string) => {
    removeMembership(batchId, studentId);
  };

  return (
    <Modal open onClose={onClose} title={`Manage batches for ${studentName}`}>
      <div className="space-y-5">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-2">In these batches</h4>
          {currentBatches.length === 0 ? (
            <div className="text-sm text-fg-muted py-2">Not in any active batch yet.</div>
          ) : (
            <div className="space-y-1.5">
              {currentBatches.map((m) => {
                const b = batches.find((bb) => bb.id === m.batchId);
                if (!b) return null;
                return (
                  <div key={m.batchId} className="flex items-center justify-between bg-bg-card border border-border rounded-xl px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.name}</div>
                      <div className="text-[11px] text-fg-muted">
                        Joined {m.joinedDate}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemove(m.batchId)}
                      className="text-xs text-fg-muted hover:text-neon-pink uppercase tracking-wider font-bold"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-2">Add to a batch</h4>
          {eligible.length === 0 ? (
            <div className="text-sm text-fg-muted py-2">Already in every active batch.</div>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto scrollbar-hide">
              {eligible.map((b) => (
                <button
                  key={b.id}
                  onClick={() => handleAdd(b.id)}
                  className="w-full text-left bg-bg-card border border-border rounded-xl px-3 py-2.5 hover:bg-bg-card-hover"
                >
                  <div className="font-medium">{b.name}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <Button variant="ghost" onClick={onClose} className="w-full">Done</Button>
      </div>
    </Modal>
  );
}

function StudentDetail({ student, onSave, onArchive, initialDate }: { student: { id: string; name: string; parentContact?: string; dateJoined: string }; onSave: (patch: { name: string; parentContact?: string }) => void; onArchive: () => void; initialDate?: string | null }) {
  const memberships = useStore((s) => s.db.memberships);
  const batches = useStore((s) => s.db.batches);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const ensureSession = useStore((s) => s.ensureSessionForBatchDate);
  const setAttendance = useStore((s) => s.setAttendance);
  const [name, setName] = useState(student.name);
  const [parent, setParent] = useState(student.parentContact ?? '');
  const [showManageBatches, setShowManageBatches] = useState(false);

  const studentBatches = memberships.filter((m) => m.studentId === student.id && m.removedDate === null);
  const activeStudentBatches = studentBatches
    .map((m) => batches.find((b) => b.id === m.batchId))
    .filter((b): b is NonNullable<typeof b> => Boolean(b) && !b!.archivedAt);

  // Calendar view state — independent of 'today', defaults to current month or the date passed via URL.
  const todayDate = new Date();
  const initial = initialDate ? parseISODate(initialDate) : null;
  const [viewYear, setViewYear] = useState(initial ? initial.getFullYear() : todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial ? initial.getMonth() : todayDate.getMonth()); // 0-indexed
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const isoOfDay = (day: number) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Pre-compute (date, batch) -> session for every day in the month, for every student batch.
  // Each (date, batch) row can be tapped once attendance is recorded.
  const calendarRows = useMemo(() => {
    const out: Array<{
      date: string;
      batchId: string;
      batchName: string;
      sessionId: string;
      day: number;
      status: 'present' | 'absent' | null;
    }> = [];
    const fromStr = isoOfDay(1);
    const toStr = isoOfDay(daysInMonth);
    for (const batch of activeStudentBatches) {
      const sessionList = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr);
      for (const sess of sessionList) {
        const realSession =
          sess.id.startsWith('virtual-')
            ? ensureSession(batch.id, sess.date)
            : sess;
        const rec = attendance.find((a) => a.sessionId === realSession.id && a.studentId === student.id);
        out.push({
          date: sess.date,
          batchId: batch.id,
          batchName: batch.name,
          sessionId: realSession.id,
          day: parseISODate(sess.date).getDate(),
          status: rec?.status ?? null,
        });
      }
    }
    // Stable order: by date, then batch name
    out.sort((a, b) => (a.date === b.date ? a.batchName.localeCompare(b.batchName) : a.date.localeCompare(b.date)));
    return out;
  }, [activeStudentBatches, sessions, attendance, viewYear, viewMonth, daysInMonth, student.id, ensureSession]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batch context — per-batch totals for this month
  const batchContext = useMemo(() => {
    const fromStr = isoOfDay(1);
    const toStr = isoOfDay(daysInMonth);
    return activeStudentBatches.map((batch) => {
      const total = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr).length;
      return { batch, total };
    });
  }, [activeStudentBatches, sessions, viewYear, viewMonth, daysInMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerFor, setPickerFor] = useState<{ sessionId: string; date: string; batchName: string } | null>(null);

  const handleCellTap = (row: { sessionId: string; date: string; batchName: string; status: 'present' | 'absent' | null }) => {
    setPickerFor({ sessionId: row.sessionId, date: row.date, batchName: row.batchName });
  };

  const handlePick = (status: 'present' | 'absent') => {
    if (!pickerFor) return;
    setAttendance(pickerFor.sessionId, student.id, status);
    setPickerFor(null);
  };

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
    setViewYear(todayDate.getFullYear());
    setViewMonth(todayDate.getMonth());
  };
  const isCurrentMonth =
    viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth();

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
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Batches</h4>
          <button onClick={() => setShowManageBatches(true)} className="text-xs text-neon-green uppercase tracking-wider font-bold">Manage</button>
        </div>
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
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Calendar</h4>
          <div className="flex items-center gap-2">
            <button onClick={goPrev} aria-label="Previous month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">‹</button>
            <button onClick={goToday} disabled={isCurrentMonth} className="text-[10px] uppercase tracking-wider font-bold text-neon-green disabled:opacity-40 disabled:cursor-default">Today</button>
            <button onClick={goNext} aria-label="Next month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">›</button>
          </div>
        </div>
        <div className="text-sm font-semibold mb-3">{monthLabel}</div>

        {batchContext.length > 0 && (
          <div className="space-y-1 mb-4">
            {batchContext.map(({ batch, total }) => (
              <div key={batch.id} className="flex items-center justify-between text-xs">
                <span className="text-fg-secondary truncate">
                  {batch.name} <span className="text-fg-muted">· {batch.daysOfWeek.map((d) => DAY_NAMES[d]).join('·')}</span>
                </span>
                <span className="text-fg-muted">{total} class{total === 1 ? '' : 'es'}</span>
              </div>
            ))}
          </div>
        )}

        {calendarRows.length === 0 ? (
          <div className="text-sm text-fg-muted py-3">No classes scheduled for this month.</div>
        ) : (
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
            <div className="min-w-[640px]">
              {/* Day-number header row */}
              <div className="grid mb-1" style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(20px, 1fr))` }}>
                <div />
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <div key={d} className="text-center text-[9px] text-fg-muted">{d}</div>
                ))}
              </div>
              {/* One row per (date × batch) */}
              {calendarRows.map((row, idx) => {
                const isFirstOfDate = idx === 0 || calendarRows[idx - 1].date !== row.date;
                return (
                  <div
                    key={`${row.date}-${row.batchId}`}
                    className="grid items-center"
                    style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(20px, 1fr))` }}
                  >
                    <div className="text-[10px] text-fg-secondary truncate pr-2 flex items-center gap-1">
                      {isFirstOfDate && (
                        <span className="text-fg-muted font-bold">{parseISODate(row.date).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                      )}
                      <span className="truncate">{row.batchName}</span>
                    </div>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      if (d !== row.day) {
                        return <div key={d} className="h-7" />;
                      }
                      const bg =
                        row.status === 'present'
                          ? 'bg-neon-green text-bg-base'
                          : row.status === 'absent'
                          ? 'bg-neon-pink text-bg-base'
                          : 'bg-bg-card border border-border text-fg-secondary';
                      return (
                        <button
                          key={d}
                          onClick={() => handleCellTap(row)}
                          className={`relative h-7 mx-0.5 rounded ${bg} flex items-center justify-center text-[10px] font-bold active:scale-95`}
                          aria-label={`${row.date} ${row.batchName} ${row.status ?? 'unmarked'}`}
                        >
                          {/* Batch-day marker — small cyan dot at the top, present on every scheduled class day regardless of attendance status. */}
                          <span
                            aria-hidden="true"
                            className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-neon-cyan/70"
                          />
                          {row.status === 'present' ? '✓' : row.status === 'absent' ? '✗' : ''}
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
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-green" />Present</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-pink" />Absent</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-border bg-bg-card" />Unmarked</div>
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

      <ManageBatchesModal
        open={showManageBatches}
        onClose={() => setShowManageBatches(false)}
        studentId={student.id}
        studentName={student.name}
      />

      {pickerFor && (
        <Modal open onClose={() => setPickerFor(null)} title="Mark attendance">
          <div className="space-y-3">
            <div className="text-sm text-fg-secondary">
              {formatISODateLong(pickerFor.date)} · {pickerFor.batchName}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="danger" onClick={() => handlePick('absent')} className="!py-4">✗ Absent</Button>
              <Button onClick={() => handlePick('present')} className="!py-4">✓ Present</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
