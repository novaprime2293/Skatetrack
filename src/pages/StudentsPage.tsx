import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, TextInput, Label, Pill, EmptyState } from '../components/ui';
import { findOrCreateRecurringSessions, batchRunsOnDate, formatISODate, formatISODateLong, parseISODate } from '../data/sessions';
import { todayISO } from '../data/storage';
import { DAY_NAMES } from '../data/types';
import { DownloadReportModal } from '../components/StudentReport';

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

  // Read ?batch=... from URL on mount and when it changes (donut chart → /students?batch=X).
  // Persist user-driven filter changes back to the URL so refresh/back keeps the filter.
  useEffect(() => {
    const urlBatch = searchParams.get('batch');
    if (urlBatch !== batchFilter) {
      setBatchFilter(urlBatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const currentUrlBatch = searchParams.get('batch');
    if (batchFilter === currentUrlBatch) return;
    const next = new URLSearchParams(searchParams);
    if (batchFilter) {
      next.set('batch', batchFilter);
    } else {
      next.delete('batch');
    }
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFilter]);

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
                    {b.daysOfWeek.map((d) => {
                      const dt = b.dayTimes?.[d];
                      const time = dt ? `${dt.startTime}–${dt.endTime}` : `${b.startTime}–${b.endTime}`;
                      return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]} ${time}`;
                    }).join(' · ')}
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
  const setAttendance = useStore((s) => s.setAttendance);
  const setAdhocAttendance = useStore((s) => s.setAdhocAttendance);
  const removeAttendance = useStore((s) => s.removeAttendance);
  const [name, setName] = useState(student.name);
  const [parent, setParent] = useState(student.parentContact ?? '');
  const [showManageBatches, setShowManageBatches] = useState(false);
  const [showAllAttendance, setShowAllAttendance] = useState(false);
  const [showDownloadReport, setShowDownloadReport] = useState(false);

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

  // Calendar model — one row per active batch, one cell per day of the month.
  // A cell is "scheduled" if a session (recurring or one-off) exists for that (batch, date);
  // otherwise the cell is empty but tappable to record adhoc attendance against that row's batch.
  //
  // Important: do NOT persist virtual sessions here. Previously this loop called
  // ensureSession() for every virtual session in the month, which raced with React's
  // concurrent renders and produced duplicate recurring sessions for the same
  // (batchId, date) — see the dedup migration in storage.ts. Calendar renders are
  // now fully read-only. Sessions get persisted the first time the user actually
  // marks attendance (handlePick → setAttendance or setAdhocAttendance → ensureSession).
  const calendarRows = useMemo(() => {
    const fromStr = isoOfDay(1);
    const toStr = isoOfDay(daysInMonth);
    return activeStudentBatches
      .map((batch) => {
        const sessionList = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr);
        const sessionByDate = new Map<string, ReturnType<typeof useStore.getState>['db']['sessions'][number]>();
        for (const sess of sessionList) {
          // Real sessions (not virtual) keyed by date for direct lookup in the render.
          if (sess.id.startsWith('virtual-')) continue;
          sessionByDate.set(sess.date, sess);
        }
        return {
          batchId: batch.id,
          batchName: batch.name,
          daysOfWeek: batch.daysOfWeek,
          sessionByDate,
        };
      })
      .sort((a, b) => a.batchName.localeCompare(b.batchName));
  }, [activeStudentBatches, sessions, viewYear, viewMonth, daysInMonth]);

  // Batch context — per-batch totals for this month
  const batchContext = useMemo(() => {
    const fromStr = isoOfDay(1);
    const toStr = isoOfDay(daysInMonth);
    return activeStudentBatches.map((batch) => {
      const total = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr).length;
      return { batch, total };
    });
  }, [activeStudentBatches, sessions, viewYear, viewMonth, daysInMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  const [pickerFor, setPickerFor] = useState<
    | { kind: 'scheduled'; sessionId: string; date: string; batchName: string }
    | { kind: 'adhoc'; batchId: string; date: string; batchName: string }
    | null
  >(null);

  const handleScheduledCellTap = (sessionId: string, date: string, batchName: string) => {
    setPickerFor({ kind: 'scheduled', sessionId, date, batchName });
  };

  const handleEmptyCellTap = (batchId: string, date: string, batchName: string) => {
    setPickerFor({ kind: 'adhoc', batchId, date, batchName });
  };

  const handlePick = (status: 'present' | 'absent') => {
    if (!pickerFor) return;
    if (pickerFor.kind === 'scheduled') {
      setAttendance(pickerFor.sessionId, student.id, status);
    } else {
      setAdhocAttendance(pickerFor.batchId, student.id, pickerFor.date, status);
    }
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
            <button
              onClick={() => setShowAllAttendance(true)}
              className="text-[10px] uppercase tracking-wider font-bold text-neon-orange hover:opacity-80"
            >
              All attendance →
            </button>
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
              {/* One row per active batch — every day is a cell. */}
              {calendarRows.map((row) => (
                <div
                  key={row.batchId}
                  className="grid items-center"
                  style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(20px, 1fr))` }}
                >
                  <div className="text-[10px] text-fg-secondary truncate pr-2">
                    {row.batchName}
                  </div>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                    const dateStr = isoOfDay(d);
                    const sess = row.sessionByDate.get(dateStr);
                    const isBatchDay = row.daysOfWeek.includes(parseISODate(dateStr).getDay());
                    const hasOneOff = !!sess && sess.type === 'one-off';
                    // A cell is a "batch day" if the batch normally runs that weekday OR a one-off/special was added for that date.
                    const isBatchDayCell = isBatchDay || hasOneOff;
                    const status = sess
                      ? attendance.find((a) => a.sessionId === sess.id && a.studentId === student.id)?.status ?? null
                      : null;
                    if (sess) {
                      // Scheduled cell — show status (present / absent / unmarked-but-scheduled).
                      const bg =
                        status === 'present'
                          ? 'bg-neon-green text-bg-base'
                          : status === 'absent'
                          ? 'bg-neon-pink text-bg-base'
                          : 'bg-bg-card border border-border text-fg-secondary';
                      return (
                        <button
                          key={d}
                          onClick={() => handleScheduledCellTap(sess.id, dateStr, row.batchName)}
                          className={`relative h-7 mx-0.5 rounded ${bg} flex items-center justify-center text-[10px] font-bold active:scale-95`}
                          aria-label={`${dateStr} ${row.batchName} ${status ?? 'unmarked'}`}
                        >
                          {/* Batch-day marker — small cyan dot at the top, present on every scheduled class day regardless of attendance status. */}
                          {isBatchDayCell && (
                            <span
                              aria-hidden="true"
                              className="absolute top-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-neon-cyan/70"
                            />
                          )}
                          {status === 'present' ? '✓' : status === 'absent' ? '✗' : ''}
                        </button>
                      );
                    }
                    // Empty cell — no session. Tappable for adhoc attendance.
                    return (
                      <button
                        key={d}
                        onClick={() => handleEmptyCellTap(row.batchId, dateStr, row.batchName)}
                        className="relative h-7 mx-0.5 rounded bg-bg-card/40 hover:bg-bg-card flex items-center justify-center text-[10px] text-fg-muted active:scale-95 border border-dashed border-border/50"
                        aria-label={`Mark ${row.batchName} on ${dateStr}`}
                        title={`Tap to mark ${row.batchName} attendance on ${dateStr}`}
                      >
                        <span className="opacity-50">+</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] uppercase tracking-wider text-fg-muted">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-green" />Present</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-neon-pink" />Absent</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded border border-border bg-bg-card" />Unmarked</div>
          <div className="flex items-center gap-1"><span className="inline-block w-1 h-1 rounded-full bg-neon-cyan/70" />Class day</div>
          <div className="flex items-center gap-1"><span className="opacity-60">+</span>Tap empty to add</div>
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

      <button
        onClick={() => setShowDownloadReport(true)}
        className="w-full text-xs text-neon-cyan uppercase tracking-wider font-bold py-2 hover:opacity-80"
      >
        📥 Download monthly report
      </button>

      <ManageBatchesModal
        open={showManageBatches}
        onClose={() => setShowManageBatches(false)}
        studentId={student.id}
        studentName={student.name}
      />

      <AllAttendanceModal
        open={showAllAttendance}
        onClose={() => setShowAllAttendance(false)}
        studentId={student.id}
        studentName={student.name}
      />

      <DownloadReportModal
        open={showDownloadReport}
        onClose={() => setShowDownloadReport(false)}
        studentId={student.id}
        studentName={student.name}
      />

      {pickerFor && (() => {
        // Look up the existing attendance record for this scheduled cell (if any), so we can
        // offer a Remove button — there's nothing to remove for an adhoc (empty-cell) tap.
        const existingRecord =
          pickerFor.kind === 'scheduled'
            ? attendance.find(
                (a) => a.sessionId === pickerFor.sessionId && a.studentId === student.id
              )
            : undefined;
        return (
          <Modal
            open
            onClose={() => setPickerFor(null)}
            title={
              pickerFor.kind === 'adhoc'
                ? 'Add attendance'
                : existingRecord
                ? 'Edit attendance'
                : 'Mark attendance'
            }
          >
            <div className="space-y-3">
              <div className="text-sm text-fg-secondary">
                {formatISODateLong(pickerFor.date)} · {pickerFor.batchName}
              </div>
              {pickerFor.kind === 'adhoc' && (
                <p className="text-xs text-fg-muted">
                  No class scheduled for this batch on this day. Pick a status to record an extra session.
                </p>
              )}
              {existingRecord && (
                <div className="text-xs text-fg-muted">
                  Currently marked{' '}
                  <span
                    className={
                      existingRecord.status === 'present'
                        ? 'text-neon-green font-bold'
                        : 'text-neon-pink font-bold'
                    }
                  >
                    {existingRecord.status}
                  </span>
                  . Pick a new status or remove it.
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="danger" onClick={() => handlePick('absent')} className="!py-4">✗ Absent</Button>
                <Button onClick={() => handlePick('present')} className="!py-4">✓ Present</Button>
              </div>
              {existingRecord && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (
                      confirm(
                        `Remove this attendance mark? (${existingRecord.status} on ${formatISODate(pickerFor.date)})`
                      )
                    ) {
                      removeAttendance(existingRecord.id);
                      setPickerFor(null);
                    }
                  }}
                  className="w-full !text-neon-pink"
                >
                  🗑 Remove this mark
                </Button>
              )}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

/**
 * "All attendance records" modal \u2014 shows every attendance record for a single student across all
 * batches (including archived / historical batches the student was later removed from). Used for
 * cleanup: the teacher can review and delete individual records here. The per-batch calendar in
 * StudentDetail intentionally has no delete button \u2014 cleanup happens in this view only.
 */
function AllAttendanceModal({
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
  const sessions = useStore((s) => s.db.sessions);
  const batches = useStore((s) => s.db.batches);
  const attendance = useStore((s) => s.db.attendance);
  const removeAttendance = useStore((s) => s.removeAttendance);

  const todayDate = new Date();
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth()); // 0-indexed
  const from = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
  const to = (() => {
    const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  })();

  const records = useMemo(() => {
    const rows = attendance
      .filter((a) => a.studentId === studentId)
      .map((a) => {
        const sess = sessions.find((s) => s.id === a.sessionId);
        const batch = sess ? batches.find((b) => b.id === sess.batchId) : null;
        return {
          id: a.id,
          date: sess?.date ?? '?',
          batchName: batch?.name ?? '(deleted batch)',
          batchArchived: !!batch?.archivedAt,
          status: a.status,
          sessionStatus: sess?.status ?? 'cancelled',
        };
      })
      .filter((r) => r.date >= from && r.date <= to)
      .sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }, [attendance, sessions, batches, studentId, from, to]);

  const presentCount = records.filter((r) => r.status === 'present').length;
  const absentCount = records.filter((r) => r.status === 'absent').length;

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
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  if (!open) return null;

  return (
    <Modal open onClose={onClose} title={`All attendance \u2014 ${studentName}`}>
      <div className="space-y-4">
        {/* Month selector */}
        <div className="flex items-center justify-between gap-3 bg-bg-card border border-border rounded-xl p-3">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="w-8 h-8 rounded-full bg-bg-base border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            \u2039
          </button>
          <div className="flex-1 text-center">
            <div className="text-sm font-semibold">{monthLabel}</div>
          </div>
          <button
            onClick={goNext}
            aria-label="Next month"
            className="w-8 h-8 rounded-full bg-bg-base border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            \u203a
          </button>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-fg-muted">
          <span><span className="text-neon-green font-bold">{presentCount}</span> present</span>
          <span><span className="text-neon-pink font-bold">{absentCount}</span> absent</span>
          <span className="ml-auto text-fg-secondary">{records.length} total</span>
        </div>

        <p className="text-[11px] text-fg-muted leading-relaxed">
          Every attendance mark for {studentName} this month, across all batches (including any batch they were moved out of).
          Tap delete to remove an incorrect mark.
        </p>

        {records.length === 0 ? (
          <div className="text-center py-6 text-sm text-fg-muted">No attendance records for this month.</div>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto scrollbar-hide -mx-1 px-1">
            {records.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 bg-bg-card border border-border rounded-xl px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {formatISODate(r.date)} \u00b7 <span className="text-fg-secondary">{r.batchName}</span>
                  </div>
                  <div className="text-[10px] mt-0.5 flex items-center gap-1.5">
                    <Pill color={r.status === 'present' ? 'green' : 'pink'}>
                      {r.status === 'present' ? 'Present' : 'Absent'}
                    </Pill>
                    {r.batchArchived && <Pill color="muted">Archived batch</Pill>}
                    {r.sessionStatus === 'cancelled' && <Pill color="muted">Cancelled session</Pill>}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Remove this attendance mark (${r.status} on ${r.date})?`)) {
                      removeAttendance(r.id);
                    }
                  }}
                  className="text-xs text-fg-muted hover:text-neon-pink uppercase tracking-wider font-bold px-2 py-1"
                  aria-label={`Delete attendance from ${r.date}`}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </Modal>
  );
}
