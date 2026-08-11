// Persistent storage layer — IndexedDB with a JSON snapshot in the same DB.
// Survives browser cache clearing, app restarts, phone reboots, OS updates.
// Auto-snapshots the entire DB after every write (cheap, single-row).
//
// Why both: IndexedDB is the durable primary. The snapshot is a row inside
// the same DB so we can recover even if the code logic forgets to maintain
// the structured tables on a future migration.

import { openDB, type IDBPDatabase } from 'idb';
import type { DB, Session } from './types';
import { SCHEMA_VERSION } from './types';

const DB_NAME = 'skatetrack';
const DB_VERSION = 2;
const SNAPSHOT_STORE = 'snapshots';
const BACKUP_STORE = 'backups';
// Convention: skatetrack-<feature>-v1 (full feature name, kebab-case, version suffix).
// See MEMORY.md Lesson L-01 — never use placeholders. 'current' was a generic placeholder
// that would collide with any future archived/backup snapshots in the same store.
const SNAPSHOT_KEY = 'skatetrack-snapshot-v1';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE);
        }
        if (!db.objectStoreNames.contains(BACKUP_STORE)) {
          db.createObjectStore(BACKUP_STORE, { keyPath: 'id' });
        }
        // v1 → v2: added backups object store for in-app daily snapshots.
        void oldVersion;
      },
    });
  }
  return dbPromise;
}

export async function loadDB(): Promise<DB | null> {
  try {
    const db = await getDB();
    const stored = (await db.get(SNAPSHOT_STORE, SNAPSHOT_KEY)) as DB | undefined;
    if (!stored) return null;
    if (stored.schemaVersion !== SCHEMA_VERSION) {
      console.warn('Skatetrack: schema version mismatch in DB, ignoring snapshot');
      return null;
    }
    // Forward-migration: ensure teacher.monthlyTarget exists. Added in v1.2.
    // We don't bump schemaVersion because this is a non-breaking one-line addition —
    // old snapshots that lack it get a sensible default (8) on load.
    if (stored.teacher && stored.teacher.monthlyTarget === undefined) {
      stored.teacher.monthlyTarget = 8;
    }
    // Forward-migration: ensure batch.costPerClass exists. Default 0 (no charge) for v1 data.
    if (Array.isArray(stored.batches)) {
      for (const batch of stored.batches) {
        if (batch && typeof batch === 'object' && batch.costPerClass === undefined) {
          batch.costPerClass = 0;
        }
        // Forward-migration: populate dayTimes from startTime/endTime for v1.5 data.
        // Existing batches had a single start/end time. New batches let the user set
        // per-day times. On load, seed dayTimes with the existing time for every day
        // in daysOfWeek so the per-day lookup works. Idempotent.
        if (batch && typeof batch === 'object' && !batch.dayTimes && Array.isArray(batch.daysOfWeek)) {
          const dt: Record<number, { startTime: string; endTime: string }> = {};
          for (const d of batch.daysOfWeek) {
            dt[d] = { startTime: batch.startTime, endTime: batch.endTime };
          }
          batch.dayTimes = dt;
        }
      }
    }
    // Forward-migration: ensure payments array exists (added for manual payment entry).
    if (!Array.isArray(stored.payments)) {
      stored.payments = [];
    }
    // One-time timezone-fix migration: any session whose date string doesn't match the batch's
    // daysOfWeek (e.g., a recurring Tuesday session stored as "2026-08-10" when the batch runs Tue)
    // gets shifted by ±1 day. Caused by a bug where toISOString().slice(0,10) returned UTC's date,
    // not local. Runs once per batch+date — safe to re-run idempotently.
    //
    // SAFETY RAILS (set 2026-08-11 after Joseph reported an extra "class" on Aug 1 caused by
    // a stale session being dragged across a month boundary):
    //   - Never shift a session that has attendance records (Joseph marked that date on purpose).
    //   - Never shift if the shift would cross a month or year boundary (don't drag old data
    //     into the current month, or vice versa).
    //   - Never shift sessions older than 30 days (stale data shouldn't be touched).
    if (Array.isArray(stored.sessions) && Array.isArray(stored.batches)) {
      let migrated = false;
      const dayOfWeekFromIso = (iso: string): number => {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d).getDay();
      };
      const shiftIso = (iso: string, delta: number): string => {
        const [y, m, d] = iso.split('-').map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setDate(dt.getDate() + delta);
        return formatLocalISODate(dt);
      };
      const attendanceBySession = new Map<string, number>();
      for (const att of stored.attendance ?? []) {
        attendanceBySession.set(att.sessionId, (attendanceBySession.get(att.sessionId) ?? 0) + 1);
      }
      for (const sess of stored.sessions) {
        if (sess.type !== 'recurring') continue;
        if (sess.status === 'cancelled') continue;
        if ((attendanceBySession.get(sess.id) ?? 0) > 0) continue; // never shift attended sessions
        if (sess.createdAt) {
          const ageMs = Date.now() - Date.parse(sess.createdAt);
          if (!Number.isNaN(ageMs) && ageMs > 30 * 24 * 60 * 60 * 1000) continue; // skip stale
        }
        const batch = stored.batches.find((b) => b.id === sess.batchId);
        if (!batch || batch.daysOfWeek.length === 0) continue;
        const dow = dayOfWeekFromIso(sess.date);
        if (batch.daysOfWeek.includes(dow)) continue; // date already correct
        // Try shifting ±1 day. Pick whichever matches the batch's daysOfWeek AND stays in the
        // same month/year. (Don't drag dates across month boundaries — that creates bogus
        // "class on Aug 1" entries when the actual class was on Jul 31.)
        const originalMonth = sess.date.slice(0, 7);
        for (const delta of [1, -1]) {
          const shifted = shiftIso(sess.date, delta);
          if (shifted.slice(0, 7) !== originalMonth) continue; // cross-month shift forbidden
          if (batch.daysOfWeek.includes(dayOfWeekFromIso(shifted))) {
            sess.date = shifted;
            migrated = true;
            break;
          }
        }
      }
      if (migrated) {
        console.info('Skatetrack: migrated session dates for IST/timezone fix');
      }
    }

    // Cleanup migration (added 2026-08-11 after Joseph's Aug 1 incident): for any recurring
    // session whose date is in a different month from its createdAt timestamp, the session
    // was almost certainly dragged across a month boundary by an earlier TZ migration that
    // didn't have the cross-month safety rail. Revert the date to createdAt's local date —
    // that's when Joseph actually marked attendance and the true "source of truth" for
    // when the class happened. Idempotent and safe: if a session was created today with
    // today's date, both are in the same month and this is a no-op.
    if (Array.isArray(stored.sessions)) {
      let reverted = 0;
      for (const sess of stored.sessions) {
        if (sess.type !== 'recurring') continue;
        if (sess.status === 'cancelled') continue;
        if (!sess.createdAt) continue;
        const dateMonth = sess.date.slice(0, 7);
        const createdDate = new Date(sess.createdAt);
        if (Number.isNaN(createdDate.getTime())) continue;
        const createdDateStr = formatLocalISODate(createdDate);
        const createdMonth = createdDateStr.slice(0, 7);
        if (dateMonth === createdMonth) continue;
        // Date is in a different month from createdAt. Revert.
        sess.date = createdDateStr;
        reverted++;
      }
      if (reverted > 0) {
        console.info(`Skatetrack: reverted ${reverted} session(s) dragged across month boundaries by earlier TZ migration`);
      }
    }
    // One-time Aug 1 / Aug 2 weekend cleanup (2026-08-11): Joseph confirmed stray 'present'
    // rows on past weekend dates (probably Aug 1, possibly Aug 2) for the weekend batch —
    // most likely from accidental taps in the new MonthlyCalendar (v10–v12) picker that
    // committed before he could back out. The v9 'present-only counts' rule was correctly
    // counting those rows as a class day, so the counter went up by one.
    //
    // Match all sessions whose date falls on Aug 1 or Aug 2, 2026 AND whose batch has
    // Saturday (6) OR Sunday (0) in daysOfWeek — the weekend-batch pattern. Lenient date
    // parsing handles both padded ('2026-08-01') and unpadded ('2026-08-1') formats.
    // Remove every attendance row for that session. Revert session status to 'scheduled'
    // so the cell renders as unmarked and the session isn't left in an orphaned
    // 'attendance_marked' state. Idempotent.
    if (Array.isArray(stored.sessions) && Array.isArray(stored.attendance) && Array.isArray(stored.batches)) {
      const isAug1or2 = (iso: string) => {
        const parts = iso.split('-').map(Number);
        if (parts.length !== 3) return false;
        const [y, m, d] = parts;
        return y === 2026 && m === 8 && (d === 1 || d === 2);
      };
      const targetSessions = new Set<string>();
      const matchedDates: string[] = [];
      for (const sess of stored.sessions) {
        if (!isAug1or2(sess.date)) continue;
        const batch = stored.batches.find((b) => b.id === sess.batchId);
        if (!batch) continue;
        if (!batch.daysOfWeek.includes(6) && !batch.daysOfWeek.includes(0)) continue;
        targetSessions.add(sess.id);
        matchedDates.push(`${sess.date} (batch ${batch.name})`);
        if (sess.status === 'attendance_marked') sess.status = 'scheduled';
      }
      if (targetSessions.size > 0) {
        const before = stored.attendance.length;
        stored.attendance = stored.attendance.filter((a) => !targetSessions.has(a.sessionId));
        const removed = before - stored.attendance.length;
        console.info(`Skatetrack: removed ${removed} stray attendance row(s) from ${targetSessions.size} session(s) on Aug 1/Aug 2 weekend batches: ${matchedDates.join(', ')}`);
      } else {
        console.info('Skatetrack: Aug 1/Aug 2 weekend cleanup scanned — no matching sessions found');
      }
    }
    // Deduplicate sessions — for each (batchId, date, type), keep one canonical session
    // and reassign any attendance records pointing at the duplicates to the kept session.
    // This is idempotent and runs on every load; after the first run with no duplicates,
    // it's a no-op. Logs once if anything was actually merged.
    if (Array.isArray(stored.sessions)) {
      // Group by (batchId, date, type) and pick the canonical session per group.
      // Canonical = the one with the most attendance records; ties broken by id.
      const groups = new Map<string, Session[]>();
      for (const sess of stored.sessions) {
        const key = `${sess.batchId}|${sess.date}|${sess.type}`;
        const group = groups.get(key);
        if (group) group.push(sess);
        else groups.set(key, [sess]);
      }
      const droppedIds = new Set<string>();
      const sessionMap = new Map<string, string>(); // droppedId -> keptId
      let dupCount = 0;
      for (const [, group] of groups) {
        if (group.length === 1) continue;
        const attCount = (s: Session) =>
          (stored.attendance ?? []).filter((a) => a.sessionId === s.id).length;
        const sorted = [...group].sort((a, b) => attCount(b) - attCount(a) || a.id.localeCompare(b.id));
        const kept = sorted[0];
        // Upgrade kept's status to attendance_marked if any duplicate was marked.
        if (kept.status === 'scheduled') {
          for (const d of sorted.slice(1)) {
            if (d.status === 'attendance_marked') {
              kept.status = 'attendance_marked';
              break;
            }
          }
        }
        for (const d of sorted.slice(1)) {
          droppedIds.add(d.id);
          sessionMap.set(d.id, kept.id);
          dupCount++;
        }
      }
      if (dupCount > 0) {
        console.info(`Skatetrack: merged ${dupCount} duplicate session(s)`);
        stored.sessions = stored.sessions.filter((s) => !droppedIds.has(s.id));
        if (Array.isArray(stored.attendance)) {
          for (const a of stored.attendance) {
            const mapped = sessionMap.get(a.sessionId);
            if (mapped) a.sessionId = mapped;
          }
        }
      }
    }
    return stored;
  } catch (e) {
    console.error('Skatetrack: failed to load DB', e);
    return null;
  }
}

export async function saveDB(db: DB): Promise<void> {
  try {
    const idb = await getDB();
    await idb.put(SNAPSHOT_STORE, db, SNAPSHOT_KEY);
  } catch (e) {
    console.error('Skatetrack: failed to save DB', e);
  }
}

export async function clearDB(): Promise<void> {
  try {
    const idb = await getDB();
    await idb.delete(SNAPSHOT_STORE, SNAPSHOT_KEY);
    // Also clear all backup snapshots so a reset truly wipes state.
    await idb.clear(BACKUP_STORE);
  } catch (e) {
    console.error('Skatetrack: failed to clear DB', e);
  }
}

// ─── In-app backup snapshots ───────────────────────────────────────────────
//
// We keep at most MAX_BACKUPS snapshots (default 2). Each is a frozen copy of the
// DB at a point in time. We rotate daily: if a snapshot already exists for today,
// we just refresh its data; otherwise we create a new one (which pushes out the
// oldest). The user can restore any snapshot from Settings → Backups.

import type { ID } from './types';

export const MAX_BACKUPS = 2;

export interface BackupSnapshot {
  id: ID;
  /** ISO timestamp. */
  timestamp: string;
  /** YYYY-MM-DD derived from timestamp — used for "one snapshot per day" semantics. */
  date: string;
  data: DB;
}

/**
 * Save a backup snapshot of the current DB. Honors the "one per day, max 2 total" rule:
 *   - If today's snapshot exists, replace its data (keeps id + date).
 *   - Else create a new snapshot, then prune to MAX_BACKUPS newest.
 */
export async function saveBackupSnapshot(db: DB): Promise<void> {
  try {
    const idb = await getDB();
    const existing = (await idb.getAll(BACKUP_STORE)) as BackupSnapshot[];
    const today = new Date().toISOString().slice(0, 10);
    const todays = existing.find((s) => s.date === today);
    if (todays) {
      todays.data = db;
      todays.timestamp = new Date().toISOString();
      await idb.put(BACKUP_STORE, todays);
      return;
    }
    const fresh: BackupSnapshot = {
      id: newId(),
      timestamp: new Date().toISOString(),
      date: today,
      data: db,
    };
    // Newest first; keep MAX_BACKUPS newest.
    const next = [...existing, fresh]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, MAX_BACKUPS);
    // Replace store contents with the pruned list.
    const tx = idb.transaction(BACKUP_STORE, 'readwrite');
    await tx.store.clear();
    for (const snap of next) {
      await tx.store.put(snap);
    }
    await tx.done;
  } catch (e) {
    console.error('Skatetrack: failed to save backup snapshot', e);
  }
}

export async function loadBackupSnapshots(): Promise<BackupSnapshot[]> {
  try {
    const idb = await getDB();
    const list = (await idb.getAll(BACKUP_STORE)) as BackupSnapshot[];
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  } catch (e) {
    console.error('Skatetrack: failed to load backup snapshots', e);
    return [];
  }
}

export async function deleteBackupSnapshot(id: string): Promise<void> {
  try {
    const idb = await getDB();
    await idb.delete(BACKUP_STORE, id);
  } catch (e) {
    console.error('Skatetrack: failed to delete backup snapshot', e);
  }
}

/** Returns the count of backup snapshots currently stored. */
export async function backupCount(): Promise<number> {
  try {
    const idb = await getDB();
    return await idb.count(BACKUP_STORE);
  } catch {
    return 0;
  }
}

// Tiny id generator
export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayISO(): string {
  return formatLocalISODate(new Date());
}

/**
 * Format any Date as YYYY-MM-DD using its LOCAL calendar components. Avoid `d.toISOString().slice(0, 10)`
 * for date-keyed app state — that returns the UTC date, which is the previous day for users east of
 * UTC (e.g., IST +5:30 means local midnight is UTC 18:30 the previous day). Using local components
 * keeps the displayed calendar aligned with what the user actually sees on the wall clock.
 */
export function formatLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
