import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { sessionEnded } from '../data/sessions';
import { Modal, Button } from './ui';
import { PRELISTED_CANCEL_REASONS } from '../data/types';
import { formatISODate } from '../data/sessions';
import { formatLocalISODate } from '../data/storage';

export function MissedAttendanceModal() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState<{ sessionId: string } | null>(null);
  const [cancelPreset, setCancelPreset] = useState<string>(PRELISTED_CANCEL_REASONS[0]);
  const [cancelOtherText, setCancelOtherText] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  const sessions = useStore((s) => s.db.sessions);
  const batches = useStore((s) => s.db.batches);
  const ensureSession = useStore((s) => s.ensureSessionForBatchDate);
  const cancelSession = useStore((s) => s.cancelSession);

  const pending = useMemo(() => {
    const now = new Date();
    const out: Array<{ sessionId: string; batchId: string; batchName: string; date: string }> = [];

    for (const sess of sessions) {
      if (sess.status === 'scheduled' && sessionEnded(sess, now)) {
        const b = batches.find((bb) => bb.id === sess.batchId);
        // Only nudge if the batch existed before the session date
        if (b && b.createdAt.slice(0, 10) <= sess.date) {
          out.push({
            sessionId: sess.id,
            batchId: sess.batchId,
            batchName: b.name,
            date: sess.date,
          });
        }
      }
    }

    const today = formatLocalISODate(new Date());
    for (const batch of batches) {
      if (batch.archivedAt) continue;
      if (batch.daysOfWeek.length === 0) continue;
      // Skip backfill if the batch was created today or later than the session date
      const batchCreatedDate = batch.createdAt.slice(0, 10);
      const cur = new Date();
      cur.setDate(cur.getDate() - 14);
      while (formatLocalISODate(cur) < today) {
        const iso = formatLocalISODate(cur);
        // Don't auto-create sessions for dates before the batch was created
        if (iso < batchCreatedDate) {
          cur.setDate(cur.getDate() + 1);
          continue;
        }
        const day = cur.getDay();
        if (batch.daysOfWeek.includes(day)) {
          const exists = sessions.find((s) => s.batchId === batch.id && s.date === iso && s.type === 'recurring');
          if (!exists) {
            const sess = ensureSession(batch.id, iso);
            if (sessionEnded(sess, now)) {
              out.push({
                sessionId: sess.id,
                batchId: batch.id,
                batchName: batch.name,
                date: iso,
              });
            }
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [sessions, batches, ensureSession]);

  const current = pending[0] ?? null;

  // Sticky dismissal: once dismissed in this session, stay dismissed
  // (resets only on actual app reload via the `dismissed` key).
  useEffect(() => {
    if (hasInteracted) {
      setDismissed(true);
    }
  }, [current?.sessionId, hasInteracted]);

  if (!current) return null;
  if (dismissed) return null;

  return (
    <>
      <Modal open onClose={() => setHasInteracted(true)} title="Heads up 🛹">
        <div className="space-y-4">
          <p className="text-fg-secondary">
            You haven't marked attendance for{' '}
            <span className="text-fg-primary font-semibold">{current.batchName}</span> on{' '}
            <span className="text-fg-primary font-semibold">{formatISODate(current.date)}</span>.
          </p>
          {pending.length > 1 && (
            <p className="text-xs text-fg-muted">+ {pending.length - 1} more pending session{pending.length - 1 === 1 ? '' : 's'} after this.</p>
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmCancel({ sessionId: current.sessionId })}>
              Cancel class
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                setHasInteracted(true);
                navigate(`/attendance/${current.sessionId}`);
              }}
            >
              Mark now
            </Button>
          </div>
          <button onClick={() => setHasInteracted(true)} className="w-full text-xs text-fg-muted uppercase tracking-wider py-2 hover:text-fg-secondary">
            Remind me later
          </button>
        </div>
      </Modal>

      <Modal open={!!confirmCancel} onClose={() => setConfirmCancel(null)} title="Why was the class cancelled?">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PRELISTED_CANCEL_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setCancelPreset(r)}
                className={`px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                  cancelPreset === r ? 'bg-neon-pink/10 border-neon-pink text-neon-pink' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
                }`}
              >
                {r}
              </button>
            ))}
            <button
              onClick={() => setCancelPreset('Other')}
              className={`col-span-2 px-3 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                cancelPreset === 'Other' ? 'bg-neon-pink/10 border-neon-pink text-neon-pink' : 'bg-bg-card border-border text-fg-secondary hover:text-fg-primary'
              }`}
            >
              Other…
            </button>
          </div>
          {cancelPreset === 'Other' && (
            <textarea
              value={cancelOtherText}
              onChange={(e) => setCancelOtherText(e.target.value)}
              placeholder="Reason…"
              rows={2}
              className="w-full bg-bg-card border border-border rounded-xl px-4 py-3 text-fg-primary placeholder-fg-muted focus:outline-none focus:border-neon-pink"
            />
          )}
          <div className="flex gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(null)} className="flex-1">Back</Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={cancelPreset === 'Other' && !cancelOtherText.trim()}
              onClick={() => {
                if (!confirmCancel) return;
                cancelSession(confirmCancel.sessionId, cancelPreset, cancelPreset === 'Other' ? cancelOtherText : undefined);
                setConfirmCancel(null);
                setHasInteracted(true);
              }}
            >
              Mark cancelled
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
