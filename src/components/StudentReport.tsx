import { useMemo, useState } from 'react';
import { useStore } from '../data/store';
import { Button, Modal } from './ui';
import type { PaymentRecord } from '../data/types';

function startOfMonth(year: number, monthIdx: number): string {
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
}
function endOfMonth(year: number, monthIdx: number): string {
  const lastDay = new Date(year, monthIdx + 1, 0).getDate();
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}
function formatINR(n: number): string {
  return `\u20b9${Math.round(n).toLocaleString('en-IN')}`;
}
function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Hidden DOM node containing the per-student monthly report. Rendered off-screen
 * (left: -10000px) so html2canvas can capture it without showing it. The captured
 * PNG is downloaded directly via a temporary <a download> link.
 */
export function StudentReport({
  studentId,
  monthLabel,
  from,
  to,
}: {
  studentId: string;
  monthLabel: string;
  from: string;
  to: string;
}) {
  const students = useStore((s) => s.db.students);
  const batches = useStore((s) => s.db.batches);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const payments = useStore((s) => s.db.payments);

  const student = students.find((s) => s.id === studentId);

  const monthKey = (() => {
    const parts = from.split('-');
    return `${parts[0]}-${parts[1]}`;
  })();
  const payment: PaymentRecord | undefined = payments.find(
    (p) => p.studentId === studentId && p.month === monthKey
  );

  const breakdown = useMemo(() => {
    if (!student) return null;

    const sessionsInMonthById = new Map<
      string,
      ReturnType<typeof useStore.getState>['db']['sessions'][number]
    >();
    for (const sess of sessions) {
      if (sess.date >= from && sess.date <= to && sess.status !== 'cancelled') {
        sessionsInMonthById.set(sess.id, sess);
      }
    }

    const studentMemberships = memberships.filter((m) => m.studentId === student.id);
    const batchesForStudent = new Map<string, typeof batches[number]>();
    for (const m of studentMemberships) {
      const b = batches.find((bb) => bb.id === m.batchId);
      if (!b || b.archivedAt) continue;
      batchesForStudent.set(b.id, b);
    }

    const datesPresent: Array<{ date: string; batchName: string }> = [];
    const datesAbsent: Array<{ date: string; batchName: string }> = [];

    const perBatch: Array<{
      batchName: string;
      classesAttended: number;
      costPerClass: number;
      total: number;
    }> = [];

    let grandTotal = 0;

    for (const batch of batchesForStudent.values()) {
      let attended = 0;
      for (const att of attendance) {
        if (att.studentId !== student.id) continue;
        const sess = sessionsInMonthById.get(att.sessionId);
        if (!sess || sess.batchId !== batch.id) continue;
        const mem = studentMemberships.find((m) => m.batchId === batch.id);
        if (!mem) continue;
        if (mem.joinedDate > sess.date) continue;
        if (mem.removedDate !== null && mem.removedDate < sess.date) continue;
        if (att.status === 'present') {
          attended++;
          datesPresent.push({ date: sess.date, batchName: batch.name });
        } else {
          datesAbsent.push({ date: sess.date, batchName: batch.name });
        }
      }
      const total = attended * batch.costPerClass;
      grandTotal += total;
      perBatch.push({
        batchName: batch.name,
        classesAttended: attended,
        costPerClass: batch.costPerClass,
        total,
      });
    }

    datesPresent.sort((a, b) => a.date.localeCompare(b.date));
    datesAbsent.sort((a, b) => a.date.localeCompare(b.date));

    return { datesPresent, datesAbsent, perBatch, grandTotal };
  }, [student, memberships, batches, sessions, attendance, from, to]);

  if (!student || !breakdown) return null;

  const generatedAt = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div
      id="student-report-canvas"
      style={{
        position: 'fixed',
        left: '-10000px',
        top: 0,
        width: '480px',
        background: '#0a0a0a',
        color: '#fafafa',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        padding: '32px',
        borderRadius: '16px',
      }}
    >
      {/* Header */}
      <div style={{ borderBottom: '2px solid #39ff14', paddingBottom: '16px', marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', letterSpacing: '2px', fontWeight: 700, color: '#39ff14', textTransform: 'uppercase' }}>
          \u26f1\ufe0f SkateTrack Report
        </div>
        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          Monthly attendance & payments
        </div>
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>{student.name}</div>
          <div style={{ fontSize: '14px', color: '#aaa', marginTop: '2px' }}>{monthLabel}</div>
        </div>
      </div>

      {/* Attendance summary */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#00f0ff', marginBottom: '12px' }}>
          Attendance
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: 1, padding: '12px', background: 'rgba(57, 255, 20, 0.08)', border: '1px solid rgba(57, 255, 20, 0.4)', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#39ff14' }}>{breakdown.datesPresent.length}</div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginTop: '4px' }}>Present</div>
          </div>
          <div style={{ flex: 1, padding: '12px', background: 'rgba(255, 46, 147, 0.08)', border: '1px solid rgba(255, 46, 147, 0.4)', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#ff2e93' }}>{breakdown.datesAbsent.length}</div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginTop: '4px' }}>Absent</div>
          </div>
          <div style={{ flex: 1, padding: '12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 800 }}>
              {breakdown.datesPresent.length + breakdown.datesAbsent.length}
            </div>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', color: '#888', marginTop: '4px' }}>Total</div>
          </div>
        </div>

        {breakdown.datesPresent.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Dates attended:</div>
            <div style={{ fontSize: '12px', lineHeight: 1.6, color: '#39ff14' }}>
              {breakdown.datesPresent.map((d) => (
                <span key={d.date + d.batchName} style={{ display: 'inline-block', marginRight: '10px' }}>
                  \u2713 {formatDate(d.date)}
                  <span style={{ color: '#666', fontSize: '11px' }}> ({d.batchName})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {breakdown.datesAbsent.length > 0 && (
          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>Dates missed:</div>
            <div style={{ fontSize: '12px', lineHeight: 1.6, color: '#ff2e93' }}>
              {breakdown.datesAbsent.map((d) => (
                <span key={d.date + d.batchName} style={{ display: 'inline-block', marginRight: '10px' }}>
                  \u2717 {formatDate(d.date)}
                  <span style={{ color: '#666', fontSize: '11px' }}> ({d.batchName})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment breakdown */}
      {breakdown.perBatch.some((pb) => pb.costPerClass > 0) && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#00f0ff', marginBottom: '12px' }}>
            Payments
          </div>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '10px', overflow: 'hidden' }}>
            {breakdown.perBatch.map((pb, i) => (
              <div
                key={pb.batchName + i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderBottom: i < breakdown.perBatch.length - 1 ? '1px solid #222' : 'none',
                  fontSize: '13px',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{pb.batchName}</div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                    {pb.classesAttended} class{pb.classesAttended === 1 ? '' : 'es'} \u00d7 {formatINR(pb.costPerClass)}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: pb.costPerClass > 0 ? '#00f0ff' : '#666' }}>
                  {pb.costPerClass > 0 ? formatINR(pb.total) : '\u2014'}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: '12px',
              padding: '14px',
              background: 'rgba(0, 240, 255, 0.08)',
              border: '1px solid rgba(0, 240, 255, 0.4)',
              borderRadius: '10px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#00f0ff', fontWeight: 700 }}>
              Total owed
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: '#00f0ff' }}>{formatINR(breakdown.grandTotal)}</div>
          </div>

          {/* Payment status + receipt */}
          <div
            style={{
              marginTop: '12px',
              padding: '14px',
              background: payment ? 'rgba(57, 255, 20, 0.08)' : 'rgba(255, 46, 147, 0.08)',
              border: payment ? '1px solid rgba(57, 255, 20, 0.4)' : '1px solid rgba(255, 46, 147, 0.4)',
              borderRadius: '10px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '1.5px',
                    fontWeight: 700,
                    color: payment ? '#39ff14' : '#ff2e93',
                  }}
                >
                  {payment ? '\u2713 Payment recorded' : '\u26a0 No payment recorded'}
                </div>
                {payment?.note && (
                  <div style={{ fontSize: '11px', color: '#aaa', marginTop: '4px', fontStyle: 'italic' }}>
                    "{payment.note}"
                  </div>
                )}
              </div>
              {payment && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Paid
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#39ff14' }}>
                    {formatINR(payment.amount)}
                  </div>
                </div>
              )}
            </div>
            {payment?.screenshotDataUrl && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                  Receipt
                </div>
                <img
                  src={payment.screenshotDataUrl}
                  alt="Payment receipt"
                  style={{ maxWidth: '100%', maxHeight: '320px', borderRadius: '8px', border: '1px solid #333', display: 'block' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ borderTop: '1px solid #333', paddingTop: '12px', fontSize: '10px', color: '#666', textAlign: 'center' }}>
        Generated {generatedAt} \u00b7 SkateTrack
      </div>
    </div>
  );
}

export function DownloadReportModal({
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
  const todayDate = new Date();
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = startOfMonth(viewYear, viewMonth);
  const to = endOfMonth(viewYear, viewMonth);
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

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
  const isCurrentMonth = viewYear === todayDate.getFullYear() && viewMonth === todayDate.getMonth();

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      // Defer to next frame so React has rendered the off-screen <StudentReport/> node.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      const html2canvasMod = await import('html2canvas');
      const html2canvas = html2canvasMod.default;
      const node = document.getElementById('student-report-canvas');
      if (!node) throw new Error('Report node not found');
      const canvas = await html2canvas(node, {
        backgroundColor: '#0a0a0a',
        scale: 2, // 2x for crispness on retina
      });
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeName = studentName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      a.download = `skatetrack-${safeName}-${from}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Hidden report node for html2canvas to capture. Always mounted while modal is open. */}
      <StudentReport studentId={studentId} monthLabel={monthLabel} from={from} to={to} />

      <Modal open onClose={onClose} title={`Download report \u2014 ${studentName}`}>
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">
            Saves a PNG image with {studentName}'s attendance dates and payment due for the selected month. Good for sharing with parents or your own records.
          </p>

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

          {error && <div className="text-sm text-neon-pink">{error}</div>}

          <Button onClick={handleDownload} disabled={busy} className="w-full !py-3">
            {busy ? 'Generating image\u2026' : `\ud83d\udcf7 Download ${monthLabel} PNG`}
          </Button>

          <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>

          {!isCurrentMonth && (
            <button
              onClick={() => {
                setViewYear(todayDate.getFullYear());
                setViewMonth(todayDate.getMonth());
              }}
              className="w-full text-xs text-neon-green uppercase tracking-wider font-bold"
            >
              Jump to current month
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}