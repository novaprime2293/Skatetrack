import { useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, Button, Modal, TextInput, Label, Pill, EmptyState } from '../components/ui';
import { DAY_NAMES } from '../data/types';
import { useNavigate } from 'react-router-dom';
import { formatLocalISODate } from '../data/storage';

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
                      {b.daysOfWeek.length === 0 ? 'No days' : b.daysOfWeek.map((d) => {
                        const dt = b.dayTimes?.[d];
                        const time = dt ? `${dt.startTime}–${dt.endTime}` : `${b.startTime}–${b.endTime}`;
                        return `${DAY_NAMES[d]} ${time}`;
                      }).join(' · ')}
                    </div>
                    {b.location && <div className="text-xs text-fg-muted mt-0.5">📍 {b.location}</div>}
                    <div className="text-xs text-fg-muted mt-1">{memberCount} student{memberCount === 1 ? '' : 's'}</div>
                    <div className="text-xs mt-1">
                      {b.costPerClass > 0 ? (
                        <span className="text-neon-cyan font-semibold">₹{b.costPerClass} / month</span>
                      ) : (
                        <span className="text-fg-muted">No charge</span>
                      )}
                    </div>
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

function CreateBatchModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (input: { name: string; daysOfWeek: number[]; startTime: string; endTime: string; dayTimes?: Record<number, { startTime: string; endTime: string }>; location?: string; costPerClass?: number }) => void }) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  // Per-day time overrides. When a day is added, seed it with the default so the user sees a sensible value.
  // If the user keeps all days the same, the result is identical to the single-time UX.
  const [dayTimes, setDayTimes] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState<string>('');

  if (!open) return null;
  const reset = () => { setName(''); setDays([]); setDayTimes({}); setLocation(''); setCost(''); };
  const costNum = parseFloat(cost);

  // When a day is added, copy times from the first selected day (or use 16:00–17:00 default).
  // When a day is removed, drop its time entry.
  const toggleDay = (i: number) => {
    setDays((cur) => {
      const isSelected = cur.includes(i);
      if (isSelected) {
        setDayTimes((dt) => {
          const next = { ...dt };
          delete next[i];
          return next;
        });
        return cur.filter((x) => x !== i);
      }
      // Seed new day with the first selected day's time, or 16:00–17:00 if this is the first day.
      const firstDay = cur[0];
      const seed = firstDay !== undefined ? dayTimes[firstDay] : { startTime: '16:00', endTime: '17:00' };
      setDayTimes((dt) => ({ ...dt, [i]: { ...(seed ?? { startTime: '16:00', endTime: '17:00' }) } }));
      return [...cur, i].sort();
    });
  };

  const updateDayTime = (i: number, field: 'startTime' | 'endTime', value: string) => {
    setDayTimes((dt) => {
      const cur = dt[i] ?? { startTime: '16:00', endTime: '17:00' };
      return { ...dt, [i]: { ...cur, [field]: value } };
    });
  };

  // Detect whether all selected days share the same start/end time. If they do, we can show a
  // "same time for all" hint and also use the simple startTime/endTime fields on the batch.
  const allSameTime = days.length > 0 && days.every(
    (d) => dayTimes[d]?.startTime === dayTimes[days[0]]?.startTime && dayTimes[d]?.endTime === dayTimes[days[0]]?.endTime,
  );
  const firstDayTime = days[0] !== undefined ? dayTimes[days[0]] : { startTime: '16:00', endTime: '17:00' };

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
                onClick={() => toggleDay(i)}
                className={`aspect-square rounded-lg text-xs font-bold border transition-all ${
                  days.includes(i) ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {days.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Time for each day</Label>
              {allSameTime && (
                <span className="text-[10px] text-fg-muted uppercase tracking-wider">All days same time</span>
              )}
            </div>
            <div className="space-y-1.5">
              {days.map((d) => {
                const t = dayTimes[d] ?? { startTime: '16:00', endTime: '17:00' };
                return (
                  <div key={d} className="grid grid-cols-[60px_1fr_1fr] items-center gap-2">
                    <span className="text-xs font-bold text-fg-secondary">{DAY_NAMES[d]}</span>
                    <input
                      type="time"
                      value={t.startTime}
                      onChange={(e) => updateDayTime(d, 'startTime', e.target.value)}
                      className="bg-bg-base border border-border rounded-xl px-2 py-1.5 text-sm text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
                      aria-label={`${DAY_NAMES[d]} start time`}
                    />
                    <input
                      type="time"
                      value={t.endTime}
                      onChange={(e) => updateDayTime(d, 'endTime', e.target.value)}
                      className="bg-bg-base border border-border rounded-xl px-2 py-1.5 text-sm text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
                      aria-label={`${DAY_NAMES[d]} end time`}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-fg-muted mt-1.5">Each day can have its own start and end time. Set them once per day.</p>
          </div>
        )}

        <div>
          <Label>Location (optional)</Label>
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Cubbon Park ramp" />
        </div>
        <div>
          <Label>Cost per month (optional)</Label>
          <div className="flex items-center gap-2">
            <span className="text-fg-muted">₹</span>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="!py-2"
            />
            <span className="text-xs text-fg-muted whitespace-nowrap">per month</span>
          </div>
          <p className="text-[11px] text-fg-muted mt-1.5">Leave 0 or blank if you don't charge for this batch. Flat per student per month, regardless of class count.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={() => { reset(); onClose(); }} className="flex-1">Cancel</Button>
          <Button
            disabled={!name.trim() || days.length === 0 || (cost.trim() !== '' && (!Number.isFinite(costNum) || costNum < 0))}
            onClick={() => {
              // Build dayTimes payload. Only emit per-day overrides if times differ from the first day.
              let dayTimesPayload: Record<number, { startTime: string; endTime: string }> | undefined;
              if (allSameTime) {
                dayTimesPayload = undefined; // rely on top-level startTime/endTime
              } else {
                dayTimesPayload = { ...dayTimes };
              }
              onCreate({
                name: name.trim(),
                daysOfWeek: days,
                startTime: firstDayTime.startTime,
                endTime: firstDayTime.endTime,
                dayTimes: dayTimesPayload,
                location: location.trim() || undefined,
                costPerClass: cost.trim() === '' ? 0 : costNum,
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

function EditBatchModal({ batchId, onClose, onSave }: { batchId: string | null; onClose: () => void; onSave: (patch: { name: string; daysOfWeek: number[]; startTime: string; endTime: string; dayTimes?: Record<number, { startTime: string; endTime: string }>; location?: string; costPerClass: number }) => void }) {
  const batch = useStore((s) => s.db.batches.find((b) => b.id === batchId));
  // useState initializers only run once. The parent component renders this modal with
  // `batchId` toggling from null → id, so we need to sync state when batch changes.
  // Hydrate per-day times from batch.dayTimes, falling back to the batch's start/end.
  const [name, setName] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [dayTimes, setDayTimes] = useState<Record<number, { startTime: string; endTime: string }>>({});
  const [location, setLocation] = useState('');
  const [cost, setCost] = useState<string>('');

  // Re-sync component state whenever the underlying batch changes (open a different batch, or
  // open the same batch after edits were applied). This is the key fix for the
  // "edit modal shows blank fields" bug.
  useEffect(() => {
    if (!batch) return;
    setName(batch.name);
    setDays(batch.daysOfWeek);
    setLocation(batch.location ?? '');
    setCost(batch.costPerClass ? String(batch.costPerClass) : '');
    const dt: Record<number, { startTime: string; endTime: string }> = {};
    for (const d of batch.daysOfWeek) {
      const entry = batch.dayTimes?.[d];
      dt[d] = { startTime: entry?.startTime ?? batch.startTime, endTime: entry?.endTime ?? batch.endTime };
    }
    setDayTimes(dt);
  }, [batch]);

  const costNum = parseFloat(cost);

  if (!batchId || !batch) return null;

  const toggleDay = (i: number) => {
    setDays((cur) => {
      const isSelected = cur.includes(i);
      if (isSelected) {
        setDayTimes((dt) => {
          const next = { ...dt };
          delete next[i];
          return next;
        });
        return cur.filter((x) => x !== i);
      }
      const firstDay = cur[0];
      const seed = firstDay !== undefined ? dayTimes[firstDay] : { startTime: batch.startTime, endTime: batch.endTime };
      setDayTimes((dt) => ({ ...dt, [i]: { ...seed } }));
      return [...cur, i].sort();
    });
  };

  const updateDayTime = (i: number, field: 'startTime' | 'endTime', value: string) => {
    setDayTimes((dt) => {
      const cur = dt[i] ?? { startTime: batch.startTime, endTime: batch.endTime };
      return { ...dt, [i]: { ...cur, [field]: value } };
    });
  };

  const allSameTime = days.length > 0 && days.every(
    (d) => dayTimes[d]?.startTime === dayTimes[days[0]]?.startTime && dayTimes[d]?.endTime === dayTimes[days[0]]?.endTime,
  );
  const firstDayTime = days[0] !== undefined ? dayTimes[days[0]] : { startTime: batch.startTime, endTime: batch.endTime };

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
                onClick={() => toggleDay(i)}
                className={`aspect-square rounded-lg text-xs font-bold border transition-all ${
                  days.includes(i) ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        {days.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label>Time for each day</Label>
              {allSameTime && (
                <span className="text-[10px] text-fg-muted uppercase tracking-wider">All days same time</span>
              )}
            </div>
            <div className="space-y-1.5">
              {days.map((d) => {
                const t = dayTimes[d] ?? { startTime: batch.startTime, endTime: batch.endTime };
                return (
                  <div key={d} className="grid grid-cols-[60px_1fr_1fr] items-center gap-2">
                    <span className="text-xs font-bold text-fg-secondary">{DAY_NAMES[d]}</span>
                    <input
                      type="time"
                      value={t.startTime}
                      onChange={(e) => updateDayTime(d, 'startTime', e.target.value)}
                      className="bg-bg-base border border-border rounded-xl px-2 py-1.5 text-sm text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
                      aria-label={`${DAY_NAMES[d]} start time`}
                    />
                    <input
                      type="time"
                      value={t.endTime}
                      onChange={(e) => updateDayTime(d, 'endTime', e.target.value)}
                      className="bg-bg-base border border-border rounded-xl px-2 py-1.5 text-sm text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
                      aria-label={`${DAY_NAMES[d]} end time`}
                    />
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-fg-muted mt-1.5">Each day can have its own start and end time.</p>
          </div>
        )}

        <div>
          <Label>Location</Label>
          <TextInput value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <Label>Cost per month</Label>
          <div className="flex items-center gap-2">
            <span className="text-fg-muted">₹</span>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              step="1"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0"
              className="!py-2"
            />
            <span className="text-xs text-fg-muted whitespace-nowrap">per month</span>
          </div>
          <p className="text-[11px] text-fg-muted mt-1.5">Leave 0 or blank if you don't charge for this batch.</p>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            disabled={!name.trim() || days.length === 0 || (cost.trim() !== '' && (!Number.isFinite(costNum) || costNum < 0))}
            onClick={() => {
              let dayTimesPayload: Record<number, { startTime: string; endTime: string }> | undefined;
              if (allSameTime) {
                dayTimesPayload = undefined;
              } else {
                dayTimesPayload = { ...dayTimes };
              }
              onSave({
                name: name.trim(),
                daysOfWeek: days,
                startTime: firstDayTime.startTime,
                endTime: firstDayTime.endTime,
                dayTimes: dayTimesPayload,
                location: location.trim() || undefined,
                costPerClass: cost.trim() === '' ? 0 : costNum,
              });
            }}
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
  batch: { id: string; name: string; startTime: string; endTime: string; daysOfWeek: number[]; dayTimes?: Record<number, { startTime: string; endTime: string }>; costPerClass?: number; archivedAt?: string | null };
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
        {(batch.costPerClass ?? 0) > 0 && <Pill color="orange">₹{batch.costPerClass}/month</Pill>}
      </div>
      {batch.dayTimes && (
        <div className="flex flex-wrap gap-1 text-[11px] text-fg-secondary">
          {batch.daysOfWeek.map((d) => {
            const dt = batch.dayTimes?.[d];
            if (!dt) return null;
            return (
              <span key={d} className="bg-bg-card border border-border rounded-full px-2 py-0.5">
                {DAY_NAMES[d]} {dt.startTime}–{dt.endTime}
              </span>
            );
          })}
        </div>
      )}

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
  const [date, setDate] = useState(formatLocalISODate(new Date()));
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
