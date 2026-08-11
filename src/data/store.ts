// In-memory store + async IndexedDB persistence. Every write triggers
// an async snapshot — the snapshot is the safety net so a future version
// of the app can always recover from a single row.
//
// Hydration is async (loadDB). After hydrate() resolves, the store is fully populated.

import { create } from 'zustand';
import { SCHEMA_VERSION } from './types';
import type {
  DB,
  Batch,
  Student,
  BatchMembership,
  Session,
  AttendanceRecord,
  PaymentRecord,
} from './types';
import { newId, nowISO, saveDB, loadDB, clearDB, saveBackupSnapshot } from './storage';

function emptyDB(): DB {
  return {
    schemaVersion: SCHEMA_VERSION,
    teacher: {
      id: newId(),
      name: 'Coach',
      createdAt: nowISO(),
      monthlyTarget: 8,
    },
    batches: [],
    students: [],
    memberships: [],
    sessions: [],
    attendance: [],
    payments: [],
  };
}

interface StoreState {
  db: DB;
  hydrated: boolean;

  hydrate: () => Promise<void>;

  updateTeacherName: (name: string) => void;
  updateMonthlyTarget: (value: number) => void;

  addBatch: (
    input: Omit<Batch, 'id' | 'teacherId' | 'createdAt' | 'archivedAt' | 'costPerClass'> & { costPerClass?: number }
  ) => Batch;
  updateBatch: (id: string, patch: Partial<Batch>) => void;
  archiveBatch: (id: string) => void;
  unarchiveBatch: (id: string) => void;

  addStudent: (input: Omit<Student, 'id' | 'createdAt' | 'archivedAt'>) => Student;
  updateStudent: (id: string, patch: Partial<Student>) => void;
  archiveStudent: (id: string) => void;

  addMembership: (batchId: string, studentId: string, joinedDate?: string) => void;
  removeMembership: (batchId: string, studentId: string, removedDate?: string) => void;

  ensureSessionForBatchDate: (batchId: string, date: string) => Session;
  addOneOffSession: (batchId: string, date: string, startTime: string, endTime: string) => Session;
  cancelSession: (sessionId: string, reasonPreset: string, reasonText?: string) => void;
  uncancelSession: (sessionId: string) => void;
  deleteOneOffSession: (sessionId: string) => void;

  setAttendance: (sessionId: string, studentId: string, status: 'present' | 'absent') => void;
  bulkSetAttendance: (sessionId: string, records: Array<{ studentId: string; status: 'present' | 'absent' }>) => void;
  resetAttendance: (sessionId: string) => void;
  /** Remove a single AttendanceRecord. If the session has no other records left, revert its status to 'scheduled'. */
  removeAttendance: (recordId: string) => void;

  /**
   * Mark attendance for a student on a date the batch doesn't normally run on.
   * Reuses an existing session for (batchId, date) if one exists, otherwise
   * creates a one-off session at the batch's normal start/end times, then
   * writes the attendance record. Returns nothing — the cell updates via the
   * normal setAttendance reactive update.
   */
  setAdhocAttendance: (batchId: string, studentId: string, date: string, status: 'present' | 'absent') => void;

  /** Upsert a payment record for (studentId, month). Updates if exists, inserts otherwise. */
  upsertPayment: (studentId: string, month: string, amount: number, screenshotDataUrl?: string, note?: string) => PaymentRecord;
  deletePayment: (paymentId: string) => void;

  exportJSON: () => string;
  importJSON: (json: string) => Promise<{ ok: boolean; error?: string }>;
  resetAll: () => Promise<void>;

  /**
   * Replace the entire DB with the contents of a backup snapshot. The caller passes
   * the snapshot's data; we persist it as the new active DB (which itself triggers
   * a fresh backup snapshot, so today's record is preserved).
   */
  restoreFromBackup: (data: DB) => void;
}

// Fire-and-forget persistence. Writes are sync to the in-memory model.
// Every snapshot replaces the previous one — small, cheap.
// We also kick off an in-app backup snapshot (max 2 rotating, one per day).
function persist(db: DB) {
  void saveDB(db);
  void saveBackupSnapshot(db);
}

export const useStore = create<StoreState>((set, get) => ({
  db: emptyDB(),
  hydrated: false,

  hydrate: async () => {
    const stored = await loadDB();
    const db = stored ?? emptyDB();
    set({ db, hydrated: true });
  },

  updateTeacherName: (name) => {
    set((s) => {
      const next = { ...s.db, teacher: { ...s.db.teacher, name } };
      persist(next);
      return { db: next };
    });
  },

  updateMonthlyTarget: (value) => {
    // Clamp to sane bounds — same range the Settings input enforces (1..31).
    const clamped = Math.max(1, Math.min(31, Math.round(value)));
    set((s) => {
      const next = { ...s.db, teacher: { ...s.db.teacher, monthlyTarget: clamped } };
      persist(next);
      return { db: next };
    });
  },

  addBatch: (input) => {
    const batch: Batch = {
      id: newId(),
      teacherId: get().db.teacher.id,
      createdAt: nowISO(),
      archivedAt: null,
      costPerClass: 0,
      ...input,
    };
    set((s) => {
      const next = { ...s.db, batches: [...s.db.batches, batch] };
      persist(next);
      return { db: next };
    });
    return batch;
  },

  updateBatch: (id, patch) => {
    set((s) => {
      const next = {
        ...s.db,
        batches: s.db.batches.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      };
      persist(next);
      return { db: next };
    });
  },

  archiveBatch: (id) => {
    set((s) => {
      const next = {
        ...s.db,
        batches: s.db.batches.map((b) => (b.id === id ? { ...b, archivedAt: nowISO() } : b)),
      };
      persist(next);
      return { db: next };
    });
  },

  unarchiveBatch: (id) => {
    set((s) => {
      const next = {
        ...s.db,
        batches: s.db.batches.map((b) => (b.id === id ? { ...b, archivedAt: null } : b)),
      };
      persist(next);
      return { db: next };
    });
  },

  addStudent: (input) => {
    const student: Student = {
      id: newId(),
      createdAt: nowISO(),
      archivedAt: null,
      ...input,
    };
    set((s) => {
      const next = { ...s.db, students: [...s.db.students, student] };
      persist(next);
      return { db: next };
    });
    return student;
  },

  updateStudent: (id, patch) => {
    set((s) => {
      const next = {
        ...s.db,
        students: s.db.students.map((st) => (st.id === id ? { ...st, ...patch } : st)),
      };
      persist(next);
      return { db: next };
    });
  },

  archiveStudent: (id) => {
    set((s) => {
      const next = {
        ...s.db,
        students: s.db.students.map((st) => (st.id === id ? { ...st, archivedAt: nowISO() } : st)),
      };
      persist(next);
      return { db: next };
    });
  },

  addMembership: (batchId, studentId, joinedDate) => {
    const existing = get().db.memberships.find(
      (m) => m.batchId === batchId && m.studentId === studentId && m.removedDate === null
    );
    if (existing) return;
    const membership: BatchMembership = {
      id: newId(),
      batchId,
      studentId,
      joinedDate: joinedDate ?? new Date().toISOString().slice(0, 10),
      removedDate: null,
      createdAt: nowISO(),
    };
    set((s) => {
      const next = { ...s.db, memberships: [...s.db.memberships, membership] };
      persist(next);
      return { db: next };
    });
  },

  removeMembership: (batchId, studentId, removedDate) => {
    set((s) => {
      const next = {
        ...s.db,
        memberships: s.db.memberships.map((m) =>
          m.batchId === batchId && m.studentId === studentId && m.removedDate === null
            ? { ...m, removedDate: removedDate ?? new Date().toISOString().slice(0, 10) }
            : m
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  ensureSessionForBatchDate: (batchId, date) => {
    const existing = get().db.sessions.find(
      (s) => s.batchId === batchId && s.date === date && s.type === 'recurring'
    );
    if (existing) return existing;
    const batch = get().db.batches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Batch not found');
    const session: Session = {
      id: newId(),
      batchId,
      date,
      startTime: batch.startTime,
      endTime: batch.endTime,
      type: 'recurring',
      status: 'scheduled',
      cancelReason: null,
      cancelReasonPreset: null,
      createdAt: nowISO(),
    };
    set((s) => {
      const next = { ...s.db, sessions: [...s.db.sessions, session] };
      persist(next);
      return { db: next };
    });
    return session;
  },

  addOneOffSession: (batchId, date, startTime, endTime) => {
    const session: Session = {
      id: newId(),
      batchId,
      date,
      startTime,
      endTime,
      type: 'one-off',
      status: 'scheduled',
      cancelReason: null,
      cancelReasonPreset: null,
      createdAt: nowISO(),
    };
    set((s) => {
      const next = { ...s.db, sessions: [...s.db.sessions, session] };
      persist(next);
      return { db: next };
    });
    return session;
  },

  cancelSession: (sessionId, reasonPreset, reasonText) => {
    set((s) => {
      const next = {
        ...s.db,
        sessions: s.db.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                status: 'cancelled' as const,
                cancelReasonPreset: reasonPreset,
                cancelReason: reasonPreset === 'Other' ? reasonText ?? '' : reasonPreset,
              }
            : sess
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  uncancelSession: (sessionId) => {
    set((s) => {
      const next = {
        ...s.db,
        sessions: s.db.sessions.map((sess) =>
          sess.id === sessionId
            ? { ...sess, status: 'scheduled' as const, cancelReasonPreset: null, cancelReason: null }
            : sess
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  deleteOneOffSession: (sessionId) => {
    set((s) => {
      const target = s.db.sessions.find((sess) => sess.id === sessionId);
      // Guard: only delete one-off sessions, and only before attendance is marked.
      if (!target || target.type !== 'one-off' || target.status !== 'scheduled') return {};
      const next = {
        ...s.db,
        sessions: s.db.sessions.filter((sess) => sess.id !== sessionId),
        attendance: s.db.attendance.filter((a) => a.sessionId !== sessionId),
      };
      persist(next);
      return { db: next };
    });
  },

  setAttendance: (sessionId, studentId, status) => {
    set((s) => {
      const existing = s.db.attendance.find(
        (a) => a.sessionId === sessionId && a.studentId === studentId
      );
      let next_attendance: AttendanceRecord[];
      if (existing) {
        next_attendance = s.db.attendance.map((a) =>
          a.id === existing.id ? { ...a, status, updatedAt: nowISO() } : a
        );
      } else {
        next_attendance = [
          ...s.db.attendance,
          {
            id: newId(),
            sessionId,
            studentId,
            status,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          },
        ];
      }
      const next = {
        ...s.db,
        attendance: next_attendance,
        sessions: s.db.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, status: 'attendance_marked' as const } : sess
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  bulkSetAttendance: (sessionId, records) => {
    set((s) => {
      const filtered = s.db.attendance.filter((a) => a.sessionId !== sessionId);
      const newRecords: AttendanceRecord[] = records.map((r) => ({
        id: newId(),
        sessionId,
        studentId: r.studentId,
        status: r.status,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      }));
      const next = {
        ...s.db,
        attendance: [...filtered, ...newRecords],
        sessions: s.db.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, status: 'attendance_marked' as const } : sess
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  resetAttendance: (sessionId) => {
    set((s) => {
      const next = {
        ...s.db,
        attendance: s.db.attendance.filter((a) => a.sessionId !== sessionId),
        sessions: s.db.sessions.map((sess) =>
          sess.id === sessionId ? { ...sess, status: 'scheduled' as const } : sess
        ),
      };
      persist(next);
      return { db: next };
    });
  },

  removeAttendance: (recordId) => {
    set((s) => {
      const target = s.db.attendance.find((a) => a.id === recordId);
      if (!target) return {};
      const remainingForSession = s.db.attendance.filter(
        (a) => a.sessionId === target.sessionId && a.id !== recordId
      );
      const next = {
        ...s.db,
        attendance: s.db.attendance.filter((a) => a.id !== recordId),
        sessions:
          remainingForSession.length === 0
            ? s.db.sessions.map((sess) =>
                sess.id === target.sessionId ? { ...sess, status: 'scheduled' as const } : sess
              )
            : s.db.sessions,
      };
      persist(next);
      return { db: next };
    });
  },

  setAdhocAttendance: (batchId, studentId, date, status) => {
    const { db } = get();
    // 1. Reuse any persisted session for (batchId, date) — recurring or one-off.
    const existing = db.sessions.find((s) => s.batchId === batchId && s.date === date);
    let session = existing;
    if (!session) {
      // 2. Otherwise create a one-off session at the batch's normal times.
      const batch = db.batches.find((b) => b.id === batchId);
      if (!batch) throw new Error('Batch not found');
      session = get().addOneOffSession(batchId, date, batch.startTime, batch.endTime);
    }
    // 3. Write the attendance record (existing helper handles upsert + status flip).
    get().setAttendance(session.id, studentId, status);
  },

  upsertPayment: (studentId, month, amount, screenshotDataUrl, note) => {
    let result!: PaymentRecord;
    set((s) => {
      const existing = s.db.payments.find((p) => p.studentId === studentId && p.month === month);
      if (existing) {
        result = {
          ...existing,
          amount,
          screenshotDataUrl: screenshotDataUrl !== undefined ? screenshotDataUrl : existing.screenshotDataUrl,
          note: note !== undefined ? note : existing.note,
          updatedAt: nowISO(),
        };
        const next = {
          ...s.db,
          payments: s.db.payments.map((p) => (p.id === existing.id ? result : p)),
        };
        persist(next);
        return { db: next };
      }
      result = {
        id: newId(),
        studentId,
        month,
        amount,
        screenshotDataUrl,
        note,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      const next = { ...s.db, payments: [...s.db.payments, result] };
      persist(next);
      return { db: next };
    });
    return result;
  },

  deletePayment: (paymentId) => {
    set((s) => {
      const next = { ...s.db, payments: s.db.payments.filter((p) => p.id !== paymentId) };
      persist(next);
      return { db: next };
    });
  },

  exportJSON: () => JSON.stringify(get().db, null, 2),

  importJSON: async (json) => {
    try {
      const parsed = JSON.parse(json) as DB;
      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        return { ok: false, error: `Schema version mismatch (expected ${SCHEMA_VERSION}, got ${parsed.schemaVersion})` };
      }
      if (!parsed.teacher || !Array.isArray(parsed.batches)) {
        return { ok: false, error: 'Invalid database shape' };
      }
      await saveDB(parsed);
      set({ db: parsed });
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  resetAll: async () => {
    const fresh = emptyDB();
    await clearDB();
    await saveDB(fresh);
    set({ db: fresh });
  },

  restoreFromBackup: (data) => {
    set((s) => {
      // Trust the incoming data — if schemaVersion mismatches, importJSON would have caught it.
      // For restore-from-backup we assume the backup is a valid prior state from the same app.
      const next = { ...s.db, ...data };
      persist(next);
      return { db: next };
    });
  },
}));
