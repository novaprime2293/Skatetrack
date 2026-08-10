import { useState } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, TextInput, Label, Pill, EmptyState } from '../components/ui';
import { DAY_NAMES } from '../data/types';
import { useNavigate } from 'react-router-dom';

export function BatchesPage() {
  const navigate = useNavigate();
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const addBatch = useStore((s) => s.addBatch);
  const updateBatch = useStore((s) => s.updateBatch);
  const archiveBatch = useStore((s) => s.archiveBatch);
  const unarchiveBatch = useStore((s) => s.unarchiveBatch);
  const addMembership = useStore((s) => s.addMembership);
  const removeMembership = useStore((s) => s.removeMembership);
  const addOneOffSession = useStore((s) => s.addOneOffSession);
  const deleteOneOffSession = useStore((s) => s.deleteOneOffSession);

  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = batches.filter((b) => (showArchived ? true : !b.archivedAt));
  const detail = detailId ? batches.find((b) => b.id === detailId) : null;
  const detailMembers = detail ? memberships.filter((m) => m.batchId === detail.id && m.removedDate === null) : [];
  const detailSessions = detail ? sessions.filter((s) => s.batchId === detail.id).slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10) : [];

  return (
    <div className="px-4 pb-12">
      <PageHeader
        title="Batches"
        subtitle="Your recurring class groups"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-xs text-fg-muted uppercase tracking-wider hover:text-fg-secondary"
            >
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
            <Button size="sm" onClick={() => setShowCreate(true)}>+ New</Button>
          </div>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">🛹</span>}
          title="No batches yet"
          body="Create a batch to start adding students and marking attendance."
          action={<Button onClick={() => setShowCreate(true)}>Create your first batch</Button>}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((b) => {
            const memberCount = memberships.filter((m) => m.batchId === b.id && m.removedDate === null).length;
            return (
              <Card key={b.id} onClick={() => setDetailId(b.id)} className={b.archivedAt ? 'opacity-60' : ''}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{b.name}</div>
                    <div className="text-xs text-fg-muted mt-1">
                      {b.daysOfWeek.length === 0 ? 'No days' : b.daysOfWeek.map((d) => DAY_NAMES[d]).join(' · ')} · {b.startTime}–{b.endTime}
                    </div>
                    {b.location && <div className="text-xs text-fg-muted mt-0.5">📍 {b.location}</div>}
                    <div className="text-xs text-fg-muted mt-1">{memberCount} student{memberCount === 1 ? '' : 's'}</div>
                  </div>
                  {b.archivedAt && <Pill color="muted">Archived</Pill>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateBatchModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={(input) => {
          addBatch(input);
          setShowCreate(false);
        }}
      />

      {detail && (
        <Modal open onClose={() => setDetailId(null)} title={detail.name}>
          <BatchDetail
            batch={detail}
            students={students}
            members={detailMembers}
            sessions={detailSessions}
            onAddMember={(studentId) => addMembership(detail.id, studentId)}
            onRemoveMember={(studentId) => removeMembership(detail.id, studentId)}
            onEdit={() => {
              setEditId(detail.id);
              setDetailId(null);
            }}
            onArchive={() => {
              if (confirm(`Archive ${detail.name}? Past attendance stays intact.`)) {
                archiveBatch(detail.id);
                setDetailId(null);
              }
            }}
            onUnarchive={() => unarchiveBatch(detail.id)}
            onAddOneOff={(date, start, end) => {
              const s = addOneOffSession(detail.id, date, start, end);
              setDetailId(null);
              navigate(`/attendance/${s.id}`);
            }}
            onDeleteOneOff={(sessionId) => deleteOneOffSession(sessionId)}
            onMarkSession={(sessionId) => {
              setDetailId(null);
              navigate(`/attendance/${sessionId}`);
            }}
          />
        </Modal>
      )}

      <EditBatchModal
        batchId={editId}
        onClose={() => setEditId(null)}
        onSave={(patch) => {
          if (editId) updateBatch(editId, patch);
          setEditId(null);
        }}
      />
    </div>
  );
}

function CreateBatchModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (input: { name: string; daysOfWeek: number[]; startTime: string; endTime: string; location?: string }) => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('17:00');
  const [location, setLocation] = useState('');

  if (!open) return null;
  const reset = () => { setName(''); setDays([]); setStart('16:00'); setEnd('17:00'); setLocation(''); };

  return (
    <Modal open onClose={() => { reset(); onClose(); }} title="New batch">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saturday Advanced" />
        </div>
        <div>
          <Label>Days of the week</Label>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((d, i) => (
              <button
                key={i}
                onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()))}
                className={`aspect-square rounded-lg text-xs font-bold border transition-all ${
                  days.includes(i) ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
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
        <div>
          <Label>Location (optional)</Label>
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cubbon Park ramp" />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} className="flex-1">Cancel</Button>
          <Button
            disabled={!name.trim() || days.length === 0}
            onClick={() => {
              onCreate({
                name: name.trim(),
                daysOfWeek: days,
                startTime: start,
                endTime: end,
                location: location.trim() || undefined,
              });
              reset();
            }}
            className="flex-1"
          >
            Create
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditBatchModal({ batchId, onClose, onSave }: { batchId: string | null; onClose: () => void; onSave: (patch: { name: string; daysOfWeek: number[]; startTime: string; endTime: string; location?: string }) => void }) {
  const batch = useStore((s) => s.db.batches.find((b) => b.id === batchId));
  const [name, setName] = useState(batch?.name ?? '');
  const [days, setDays] = useState<number[]>(batch?.daysOfWeek ?? []);
  const [start, setStart] = useState(batch?.startTime ?? '16:00');
  const [end, setEnd] = useState(batch?.endTime ?? '17:00');
  const [location, setLocation] = useState(batch?.location ?? '');

  if (!batchId || !batch) return null;

  return (
    <Modal open onClose={onClose} title="Edit batch">
      <div className="space-y-3">
        <div>
          <Label>Name</Label>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label>Days</Label>
          <div className="grid grid-cols-7 gap-1.5">
            {DAY_NAMES.map((d, i) => (
              <button
                key={i}
                onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i].sort()))}
                className={`aspect-square rounded-lg text-xs font-bold border transition-all ${
                  days.includes(i) ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Start</Label><TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End</Label><TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div>
          <Label>Location</Label>
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            disabled={!name.trim() || days.length === 0}
            onClick={() => onSave({ name: name.trim(), daysOfWeek: days, startTime: start, endTime: end, location: location.trim() || undefined })}
            className="flex-1"
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BatchDetail({
  batch,
  students,
  members,
  sessions,
  onAddMember,
  onRemoveMember,
  onEdit,
  onArchive,
  onUnarchive,
  onAddOneOff,
  onDeleteOneOff,
  onMarkSession,
}: {
  batch: { id: string; name: string; startTime: string; endTime: string; daysOfWeek: number[]; archivedAt?: string | null };
  students: Array<{ id: string; name: string; archivedAt?: string | null }>;
  members: Array<{ studentId: string }>;
  sessions: Array<{ id: string; date: string; type: string; status: string }>;
  onAddMember: (studentId: string) => void;
  onRemoveMember: (studentId: string) => void;
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onAddOneOff: (date: string, start: string, end: string) => void;
  onDeleteOneOff: (sessionId: string) => void;
  onMarkSession: (sessionId: string) => void;
}) {
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [showOneOff, setShowOneOff] = useState(false);
  const memberIds = new Set(members.map((m) => m.studentId));
  const eligibleStudents = students.filter((s) => !s.archivedAt && !memberIds.has(s.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        <Pill>{batch.daysOfWeek.map((d) => DAY_NAMES[d]).join(' · ')}</Pill>
        <Pill color="cyan">{batch.startTime}–{batch.endTime}</Pill>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Students ({members.length})</h4>
          <button onClick={() => setShowAddStudent(true)} className="text-xs text-neon-green uppercase tracking-wider font-bold">+ Add</button>
        </div>
        {members.length === 0 ? (
          <div className="text-sm text-fg-muted py-3">No students yet.</div>
        ) : (
          <div className="space-y-1.5">
            {members.map((m) => {
              const s = students.find((st) => st.id === m.studentId);
              if (!s) return null;
              return (
                <div key={m.studentId} className="flex items-center justify-between bg-bg-card border border-border rounded-xl px-3 py-2">
                  <span className="font-medium">{s.name}</span>
                  <button onClick={() => { if (confirm(`Remove ${s.name} from this batch?`)) onRemoveMember(s.id); }} className="text-xs text-fg-muted hover:text-neon-pink uppercase tracking-wider">Remove</button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Recent sessions</h4>
          <button onClick={() => setShowOneOff(true)} className="text-xs text-neon-green uppercase tracking-wider font-bold">+ Add special class</button>
        </div>
        {sessions.length === 0 ? (
          <div className="text-sm text-fg-muted py-3">No sessions yet.</div>
        ) : (
          <div className="space-y-1.5">
            {sessions.map((s) => {
              const isSpecial = s.type === 'one-off';
              const canDelete = isSpecial && s.status === 'scheduled';
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between bg-bg-card border rounded-xl px-3 py-2 ${isSpecial ? 'border-neon-orange/40' : 'border-border'} ${!canDelete ? 'cursor-pointer' : ''}`}
                  onClick={canDelete ? undefined : () => onMarkSession(s.id)}
                >
                  <span className="text-sm flex items-center gap-2">
                    {s.date}
                    {isSpecial && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-neon-orange border border-neon-orange/40 rounded-full px-1.5 py-0.5">
                        Special
                      </span>
                    )}
                  </span>
                  <div className="flex items-center gap-2">
                    <Pill color={s.status === 'attendance_marked' ? 'green' : s.status === 'cancelled' ? 'muted' : 'yellow'}>
                      {s.status === 'attendance_marked' ? 'Marked' : s.status === 'cancelled' ? 'Cancelled' : 'Pending'}
                    </Pill>
                    {canDelete && (
                      <button
                        onClick={() => {
                          if (confirm(`Delete this special class on ${s.date}?`)) onDeleteOneOff(s.id);
                        }}
                        className="text-xs text-fg-muted hover:text-neon-pink uppercase tracking-wider font-bold"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4 flex gap-2">
        <Button variant="secondary" onClick={onEdit} className="flex-1">Edit</Button>
        {batch.archivedAt ? (
          <Button variant="secondary" onClick={onUnarchive}>Unarchive</Button>
        ) : (
          <Button variant="ghost" onClick={onArchive}>Archive</Button>
        )}
      </div>

      {showAddStudent && (
        <Modal open onClose={() => setShowAddStudent(false)} title="Add student">
          <div className="space-y-2">
            {eligibleStudents.length === 0 ? (
              <div className="text-sm text-fg-muted py-3">All students are already in this batch. Add new students from the Students tab.</div>
            ) : (
              eligibleStudents.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { onAddMember(s.id); setShowAddStudent(false); }}
                  className="w-full text-left bg-bg-card border border-border rounded-xl px-3 py-2.5 hover:bg-bg-card-hover"
                >
                  {s.name}
                </button>
              ))
            )}
          </div>
        </Modal>
      )}

      {showOneOff && (
        <OneOffModal
          batchStart={batch.startTime}
          batchEnd={batch.endTime}
          onClose={() => setShowOneOff(false)}
          onCreate={(date, start, end) => { onAddOneOff(date, start, end); setShowOneOff(false); }}
        />
      )}
    </div>
  );
}

function OneOffModal({ batchStart, batchEnd, onClose, onCreate }: { batchStart: string; batchEnd: string; onClose: () => void; onCreate: (date: string, start: string, end: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [start, setStart] = useState(batchStart);
  const [end, setEnd] = useState(batchEnd);

  return (
    <Modal open onClose={onClose} title="Add special class">
      <div className="space-y-3">
        <div>
          <Label>Date</Label>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Start</Label><TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} /></div>
          <div><Label>End</Label><TextInput type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onCreate(date, start, end)} className="flex-1">Add</Button>
        </div>
      </div>
    </Modal>
  );
}
