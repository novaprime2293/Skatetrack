import { useMemo, useState, useRef, type ChangeEvent } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, SectionTitle, EmptyState, Button } from '../components/ui';

function startOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}
function endOfMonth(year: number, monthIdx: number): string {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
function monthKey(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}`;
}
function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * Compress an uploaded image to a base64 JPEG data URL. Resizes to max 1200px wide
 * (keeps aspect ratio) and re-encodes as JPEG at 0.8 quality. Typical receipt photo
 * lands around 100-300KB after compression instead of several MB.
 */
async function compressImageToDataUrl(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Image decode failed'));
  });
  const scale = Math.min(1, maxWidth / img.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function PaymentsPage() {
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const payments = useStore((s) => s.db.payments);
  const upsertPayment = useStore((s) => s.upsertPayment);
  const deletePayment = useStore((s) => s.deletePayment);

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

  const from = startOfMonth(viewYear, viewMonth);
  const to = endOfMonth(viewYear, viewMonth);
  const mk = monthKey(viewYear, viewMonth);

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
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
  };
  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const activeBatches = useMemo(() => batches.filter((b) => !b.archivedAt), [batches]);
  const activeStudents = useMemo(() => students.filter((s) => !s.archivedAt), [students]);

  const sessionsInMonthById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof useStore.getState>['db']['sessions'][number]>();
    for (const sess of sessions) {
      if (sess.date >= from && sess.date <= to && sess.status !== 'cancelled') {
        map.set(sess.id, sess);
      }
    }
    return map;
  }, [sessions, from, to]);

  // Per-student row: owed amount + saved payment (if any)
  const rows = useMemo(() => {
    return activeStudents
      .map((student) => {
        const studentMemberships = memberships.filter((m) => m.studentId === student.id);
        const batchesForStudent = new Map<string, typeof batches[number]>();
        for (const m of studentMemberships) {
          if (batchFilter && m.batchId !== batchFilter) continue;
          const b = batches.find((bb) => bb.id === m.batchId);
          if (!b || b.archivedAt) continue;
          batchesForStudent.set(b.id, b);
        }

        const perBatch: Array<{
          batchName: string;
          classesAttended: number;
          costPerClass: number;
          total: number;
        }> = [];

        let owed = 0;
        for (const batch of batchesForStudent.values()) {
          let attended = 0;
          for (const att of attendance) {
            if (att.studentId !== student.id) continue;
            if (att.status !== 'present') continue;
            const sess = sessionsInMonthById.get(att.sessionId);
            if (!sess || sess.batchId !== batch.id) continue;
            const mem = studentMemberships.find((m) => m.batchId === batch.id);
            if (!mem) continue;
            if (mem.joinedDate > sess.date) continue;
            if (mem.removedDate !== null && mem.removedDate < sess.date) continue;
            attended++;
          }
          const total = attended * batch.costPerClass;
          owed += total;
          perBatch.push({ batchName: batch.name, classesAttended: attended, costPerClass: batch.costPerClass, total });
        }

        const payment = payments.find((p) => p.studentId === student.id && p.month === mk);
        return {
          studentId: student.id,
          name: student.name,
          owed,
          perBatch,
          payment,
        };
      })
      .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
  }, [activeStudents, memberships, batches, attendance, sessionsInMonthById, payments, batchFilter, mk]);

  const totalCollected = rows.reduce((sum, r) => sum + (r.payment?.amount ?? 0), 0);
  const totalOwed = rows.reduce((sum, r) => sum + r.owed, 0);
  const totalPending = Math.max(0, totalOwed - totalCollected);
  const studentsWithPayments = rows.filter((r) => r.payment).length;

  return (
    <div className="px-4 pb-12">
      <PageHeader title="Payments" subtitle="What each student owes · what you've collected" />

      {/* Month selector */}
      <Card className="mb-4 !p-3">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={goPrev}
            aria-label="Previous month"
            className="w-9 h-9 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            ‹
          </button>
          <div className="flex-1 text-center">
            <div className="text-base font-semibold">{monthLabel}</div>
          </div>
          <button
            onClick={goNext}
            aria-label="Next month"
            className="w-9 h-9 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary flex items-center justify-center"
          >
            ›
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <button
            onClick={goToday}
            disabled={isCurrentMonth}
            className="text-[10px] uppercase tracking-wider font-bold text-neon-green disabled:opacity-40 disabled:cursor-default"
          >
            Today
          </button>
        </div>
      </Card>

      {/* Optional batch filter */}
      {activeBatches.length > 0 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4">
          <button
            onClick={() => setBatchFilter(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
              batchFilter === null
                ? 'bg-neon-cyan text-bg-base border-neon-cyan'
                : 'bg-bg-card border-border text-fg-secondary'
            }`}
          >
            All batches
          </button>
          {activeBatches.map((b) => (
            <button
              key={b.id}
              onClick={() => setBatchFilter(b.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
                batchFilter === b.id
                  ? 'bg-neon-cyan text-bg-base border-neon-cyan'
                  : 'bg-bg-card border-border text-fg-secondary'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <SummaryTile label="Owed" value={formatINR(totalOwed)} color="muted" />
        <SummaryTile label="Collected" value={formatINR(totalCollected)} color="green" />
        <SummaryTile label="Pending" value={formatINR(totalPending)} color={totalPending > 0 ? 'pink' : 'muted'} />
      </div>

      {activeStudents.length === 0 ? (
        <EmptyState
          icon={<span className="text-3xl">💰</span>}
          title="No active students"
          body="Add students from the Students tab to start tracking payments."
        />
      ) : rows.length === 0 ? (
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">No students in the filtered batch this month.</div>
        </Card>
      ) : (
        <>
          <SectionTitle
            action={
              <span className="text-[10px] text-fg-muted">
                {studentsWithPayments} of {rows.length} paid
              </span>
            }
          >
            Students
          </SectionTitle>
          <div className="space-y-2">
            {rows.map((row) => (
              <PaymentRow
                key={row.studentId}
                studentId={row.studentId}
                studentName={row.name}
                owed={row.owed}
                perBatch={row.perBatch}
                initialPayment={row.payment}
                monthKey={mk}
                onSave={(amount, screenshotDataUrl, note) =>
                  upsertPayment(row.studentId, mk, amount, screenshotDataUrl, note)
                }
                onDelete={() => row.payment && deletePayment(row.payment.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, color }: { label: string; value: string; color: 'green' | 'pink' | 'muted' }) {
  const colorClass =
    color === 'green' ? 'text-neon-green' : color === 'pink' ? 'text-neon-pink' : 'text-fg-primary';
  return (
    <Card className="text-center !p-3">
      <div className={`text-base font-extrabold ${colorClass} truncate`}>{value}</div>
      <div className="text-[10px] text-fg-muted uppercase tracking-wider mt-1">{label}</div>
    </Card>
  );
}

function PaymentRow({
  studentName,
  owed,
  perBatch,
  initialPayment,
  monthKey,
  onSave,
  onDelete,
}: {
  studentId: string;
  studentName: string;
  owed: number;
  perBatch: Array<{ batchName: string; classesAttended: number; costPerClass: number; total: number }>;
  initialPayment:
    | { id: string; amount: number; screenshotDataUrl?: string; note?: string }
    | undefined;
  monthKey: string;
  onSave: (amount: number, screenshotDataUrl?: string, note?: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState<string>(
    initialPayment ? String(initialPayment.amount) : owed > 0 ? String(owed) : '0'
  );
  const [note, setNote] = useState<string>(initialPayment?.note ?? '');
  const [screenshot, setScreenshot] = useState<string | undefined>(initialPayment?.screenshotDataUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const paid = initialPayment?.amount ?? 0;
  const remaining = Math.max(0, owed - paid);
  const isFullyPaid = owed > 0 && paid >= owed;
  const isPartiallyPaid = paid > 0 && paid < owed;
  const isUnpaid = paid === 0;

  const statusColor = isFullyPaid
    ? 'text-neon-green'
    : isPartiallyPaid
    ? 'text-neon-yellow'
    : isUnpaid
    ? 'text-neon-pink'
    : 'text-fg-muted';

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const url = await compressImageToDataUrl(file);
      setScreenshot(url);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = () => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n < 0) {
      setError('Enter a valid amount');
      return;
    }
    onSave(n, screenshot, note.trim() || undefined);
    setEditing(false);
  };

  const handleCancel = () => {
    setAmount(initialPayment ? String(initialPayment.amount) : owed > 0 ? String(owed) : '0');
    setNote(initialPayment?.note ?? '');
    setScreenshot(initialPayment?.screenshotDataUrl);
    setError(null);
    setEditing(false);
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold truncate">{studentName}</div>
          <div className="text-[11px] text-fg-muted mt-0.5 truncate">
            {perBatch.length === 0
              ? 'No batch charges this month'
              : perBatch
                  .map((pb) => `${pb.batchName}: ${pb.classesAttended}× ${formatINR(pb.costPerClass)}`)
                  .join(' · ')}
          </div>
        </div>
        <div className="text-right whitespace-nowrap">
          <div className="text-base font-extrabold text-fg-primary">{formatINR(owed)}</div>
          <div className={`text-[11px] font-bold ${statusColor}`}>
            {isFullyPaid ? 'Paid in full' : isPartiallyPaid ? `Paid ${formatINR(paid)}` : isUnpaid ? 'Unpaid' : '—'}
          </div>
          {isPartiallyPaid && <div className="text-[10px] text-fg-muted">{formatINR(remaining)} remaining</div>}
        </div>
      </div>

      {!editing && (
        <div className="flex items-center gap-2 mt-2">
          {initialPayment?.screenshotDataUrl && (
            <a
              href={initialPayment.screenshotDataUrl}
              target="_blank"
              rel="noreferrer"
              className="block w-12 h-12 rounded-lg overflow-hidden border border-border flex-shrink-0"
              aria-label="View payment screenshot"
            >
              <img src={initialPayment.screenshotDataUrl} alt="Payment receipt" className="w-full h-full object-cover" />
            </a>
          )}
          {initialPayment?.note && (
            <span className="text-[11px] text-fg-secondary italic truncate min-w-0">"{initialPayment.note}"</span>
          )}
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            {initialPayment ? 'Edit' : 'Record payment'}
          </Button>
        </div>
      )}

      {editing && (
        <div className="space-y-2 mt-2 pt-2 border-t border-border">
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-fg-muted font-bold mb-1">
              Amount paid (₹)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-fg-muted">₹</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 bg-bg-base border border-border rounded-xl px-3 py-2 text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
                aria-label="Amount paid"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-fg-muted font-bold mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. UPI ref, paid in cash"
              className="w-full bg-bg-base border border-border rounded-xl px-3 py-2 text-sm text-fg-primary focus:outline-none focus:border-neon-green focus:ring-1 focus:ring-neon-green/50"
              aria-label="Payment note"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-fg-muted font-bold mb-1">
              Screenshot (optional)
            </label>
            <div className="flex items-center gap-2">
              {screenshot ? (
                <a
                  href={screenshot}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0"
                  aria-label="View current screenshot"
                >
                  <img src={screenshot} alt="Payment receipt" className="w-full h-full object-cover" />
                </a>
              ) : (
                <div className="w-16 h-16 rounded-lg border border-dashed border-border flex items-center justify-center text-fg-muted text-xs flex-shrink-0">
                  None
                </div>
              )}
              <div className="flex-1 flex flex-col gap-1.5">
                <label className="cursor-pointer bg-bg-card border border-border rounded-xl px-3 py-2 text-sm text-center hover:bg-bg-card-hover">
                  {busy ? 'Compressing…' : screenshot ? 'Replace screenshot' : 'Attach screenshot'}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    // capture="environment" hints mobile browsers to open the back camera;
                    // desktop users still get a normal file picker.
                    capture="environment"
                    className="hidden"
                    onChange={handleFile}
                  />
                </label>
                {screenshot && (
                  <button
                    onClick={() => setScreenshot(undefined)}
                    className="text-[10px] text-fg-muted hover:text-neon-pink uppercase tracking-wider font-bold"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && <div className="text-xs text-neon-pink">{error}</div>}

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={handleCancel} className="flex-1">
              Cancel
            </Button>
            {initialPayment && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm(`Delete payment record for ${studentName} in ${monthKey}?`)) {
                    onDelete();
                    setEditing(false);
                  }
                }}
                className="text-neon-pink"
              >
                Delete
              </Button>
            )}
            <Button size="sm" onClick={handleSave} className="flex-1">
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}