// Notification helpers for end-of-batch attendance reminders.
//
// Limitations (honest):
// - Web notifications only fire reliably while the PWA is open or recently active.
// - iOS Safari does NOT support web push for PWAs (as of 2026). Notifications fire only
//   when the app is open in a tab on iPhone. Android Chrome is more permissive.
// - No backend push server. The app polls via setInterval; if the OS kills the process
//   for too long, the reminder may be missed.

const NOTIFY_OPT_IN_KEY = 'skatetrack-notify-opt-in-v1';

export function isNotifyOptIn(): boolean {
  try {
    return localStorage.getItem(NOTIFY_OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}
export function setNotifyOptIn(v: boolean): void {
  try {
    localStorage.setItem(NOTIFY_OPT_IN_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function notifSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notifPermission(): NotificationPermission | 'unsupported' {
  if (!notifSupported()) return 'unsupported';
  return Notification.permission;
}

export async function notifRequestPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notifSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function fireNotification(title: string, body: string): boolean {
  if (!notifSupported()) return false;
  if (Notification.permission !== 'granted') return false;
  try {
    new Notification(title, {
      body,
      tag: 'skatetrack-missed-attendance',
      // No icon path — browser will use default. (We could add a public/skate.png later.)
      silent: false,
    });
    return true;
  } catch {
    return false;
  }
}

// Track which sessionIds we've already notified about so we don't spam on every tick.
const notifiedSessionIds = new Set<string>();
export function clearNotified(sessionId: string) {
  notifiedSessionIds.delete(sessionId);
}
export function clearAllNotified() {
  notifiedSessionIds.clear();
}

/**
 * Scan sessions that ended in the last `windowMinutes` minutes with status === 'scheduled'
 * and no attendance yet, fire a notification for each (once per session), and return the
 * number of notifications fired. Caller runs this on a 60s setInterval.
 */
export function scanAndNotify(
  sessions: Array<{ id: string; batchId: string; date: string; endTime: string; status: string }>,
  attendance: Array<{ sessionId: string }>,
  batches: Array<{ id: string; name: string }>,
  windowMinutes = 5,
  now: Date = new Date()
): number {
  if (!notifSupported() || Notification.permission !== 'granted') return 0;
  if (!isNotifyOptIn()) return 0;

  const attendedIds = new Set(attendance.map((a) => a.sessionId));
  const batchNameById = new Map(batches.map((b) => [b.id, b.name]));

  let fired = 0;
  for (const sess of sessions) {
    if (sess.status !== 'scheduled') continue;
    if (attendedIds.has(sess.id)) continue;
    if (notifiedSessionIds.has(sess.id)) continue;

    const [Y, M, D] = sess.date.split('-').map(Number);
    const [h, m] = sess.endTime.split(':').map(Number);
    const end = new Date(Y, M - 1, D, h, m);
    const ageMs = now.getTime() - end.getTime();
    if (ageMs < 0) continue; // hasn't ended yet
    if (ageMs > windowMinutes * 60 * 1000) continue; // ended too long ago

    const batchName = batchNameById.get(sess.batchId) ?? 'your batch';
    const firedOk = fireNotification(
      `\ud83d\udccb Mark attendance \u2014 ${batchName}`,
      `Class ended at ${sess.endTime}. Open SkateTrack to swipe cards.`
    );
    if (firedOk) {
      notifiedSessionIds.add(sess.id);
      fired++;
    }
  }
  return fired;
}