// Core data model — see PRD §5
// IDs are short string ids (cuid-style) generated client-side.

export type ID = string;

export interface Teacher {
  id: ID;
  name: string;
  createdAt: string; // ISO
}

export interface Batch {
  id: ID;
  teacherId: ID;
  name: string;
  /** Days of week the batch recurs on. 0=Sun, 1=Mon, ..., 6=Sat. */
  daysOfWeek: number[];
  /** HH:mm 24h */
  startTime: string;
  /** HH:mm 24h */
  endTime: string;
  location?: string;
  archivedAt?: string | null; // soft-delete
  createdAt: string;
}

export interface Student {
  id: ID;
  name: string;
  parentContact?: string;
  /** ISO date YYYY-MM-DD */
  dateJoined: string;
  archivedAt?: string | null;
  createdAt: string;
}

// Join table: a student belongs to a batch between joinedDate and removedDate.
// Historical attendance remains intact even if this row is removed.
export interface BatchMembership {
  id: ID;
  batchId: ID;
  studentId: ID;
  /** ISO date YYYY-MM-DD */
  joinedDate: string;
  /** ISO date YYYY-MM-DD, null = still active */
  removedDate: string | null;
  createdAt: string;
}

export type SessionType = 'recurring' | 'one-off';
export type SessionStatus = 'scheduled' | 'attendance_marked' | 'cancelled';

export interface Session {
  id: ID;
  batchId: ID;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** HH:mm 24h */
  startTime: string;
  /** HH:mm 24h */
  endTime: string;
  type: SessionType;
  status: SessionStatus;
  cancelReason?: string | null; // free text if prelisted "Other" was selected
  cancelReasonPreset?: string | null; // one of PRELISTED_REASONS, or 'Other'
  createdAt: string;
}

export interface AttendanceRecord {
  id: ID;
  sessionId: ID;
  studentId: ID;
  status: 'present' | 'absent';
  createdAt: string;
  updatedAt: string;
}

export const PRELISTED_CANCEL_REASONS = [
  'Rained out',
  'Public holiday',
  'Venue unavailable',
  'Teacher unavailable',
] as const;
export type CancelReasonPreset = (typeof PRELISTED_CANCEL_REASONS)[number] | 'Other';

export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export interface DB {
  schemaVersion: number;
  teacher: Teacher;
  batches: Batch[];
  students: Student[];
  memberships: BatchMembership[];
  sessions: Session[];
  attendance: AttendanceRecord[];
}

export const SCHEMA_VERSION = 1;
