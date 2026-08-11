// Persistent storage layer — IndexedDB with a JSON snapshot in the same DB.
// Survives browser cache clearing, app restarts, phone reboots, OS updates.
// Auto-snapshots the entire DB after every write (cheap, single-row).
//
// Why both: IndexedDB is the durable primary. The snapshot is a row inside
// the same DB so we can recover even if the code logic forgets to maintain
// the structured tables on a future migration.

import { openDB, type IDBPDatabase } from 'idb';
import type { DB } from './types';
import { SCHEMA_VERSION } from './types';

const DB_NAME = 'skatetrack';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
// Convention: skatetrack-<feature>-v1 (full feature name, kebab-case, version suffix).
// See MEMORY.md Lesson L-01 — never use placeholders. 'current' was a generic placeholder
// that would collide with any future archived/backup snapshots in the same store.
const SNAPSHOT_KEY = 'skatetrack-snapshot-v1';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          db.createObjectStore(SNAPSHOT_STORE);
        }
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
      }
    }
    // Forward-migration: ensure payments array exists (added for manual payment entry).
    if (!Array.isArray(stored.payments)) {
      stored.payments = [];
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
  } catch (e) {
    console.error('Skatetrack: failed to clear DB', e);
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
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
