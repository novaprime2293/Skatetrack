// Date/session helpers — sessions are date strings YYYY-MM-DD.

import type { Batch, Session } from './types';
import { todayISO } from './storage';

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatISODate(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatISODateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function isPastDate(iso: string): boolean {
  return iso < todayISO();
}

export function isToday(iso: string): boolean {
  return iso === todayISO();
}

export function batchRunsOnDate(batch: Batch, date: string): boolean {
  const day = parseISODate(date).getDay();
  return batch.daysOfWeek.includes(day);
}

export function batchSessionsInRange(batch: Batch, from: string, to: string): string[] {
  if (batch.daysOfWeek.length === 0) return [];
  const out: string[] = [];
  const start = parseISODate(from);
  const end = parseISODate(to);
  const cur = new Date(start);
  while (cur <= end) {
    const iso = cur.toISOString().slice(0, 10);
    if (batch.daysOfWeek.includes(cur.getDay())) {
      out.push(iso);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function findOrCreateRecurringSessions(
  batch: Batch,
  existingSessions: Session[],
  from: string,
  to: string
): Session[] {
  const dates = batchSessionsInRange(batch, from, to);
  const out: Session[] = [];
  for (const date of dates) {
    const existing = existingSessions.find(
      (s) => s.batchId === batch.id && s.date === date && s.type === 'recurring'
    );
    if (existing) {
      out.push(existing);
    } else {
      out.push({
        id: `virtual-${batch.id}-${date}`,
        batchId: batch.id,
        date,
        startTime: batch.startTime,
        endTime: batch.endTime,
        type: 'recurring',
        status: 'scheduled',
        cancelReason: null,
        cancelReasonPreset: null,
        createdAt: '',
      });
    }
  }
  for (const s of existingSessions) {
    if (s.batchId === batch.id && s.type === 'one-off' && s.date >= from && s.date <= to) {
      if (!out.find((o) => o.id === s.id)) out.push(s);
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export function sessionEnded(s: Session, now: Date = new Date()): boolean {
  const [Y, M, D] = s.date.split('-').map(Number);
  const [h, m] = s.endTime.split(':').map(Number);
  const end = new Date(Y, M - 1, D, h, m);
  return now > end;
}

export function isActiveSession(s: Session, now: Date = new Date()): boolean {
  const [Y, M, D] = s.date.split('-').map(Number);
  const [sh, sm] = s.startTime.split(':').map(Number);
  const [eh, em] = s.endTime.split(':').map(Number);
  const start = new Date(Y, M - 1, D, sh, sm);
  const end = new Date(Y, M - 1, D, eh, em);
  return now >= start && now <= end;
}

export function activeRosterStudentIds(
  batchId: string,
  memberships: Array<{ batchId: string; studentId: string; joinedDate: string; removedDate: string | null }>,
  date: string
): string[] {
  return memberships
    .filter((m) => m.batchId === batchId && m.joinedDate <= date && (m.removedDate === null || m.removedDate >= date))
    .map((m) => m.studentId);
}
