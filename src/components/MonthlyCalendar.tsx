import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import {
  findOrCreateRecurringSessions,
  parseISODate,
  formatISODate,
  formatISODateLong,
} from '../data/sessions';
import { Card, Modal, Button } from './ui';
import { todayISO } from '../data/storage';

type CellStatus = 'present' | 'absent' | 'unmarked';

interface DayCell {
  /** Sessions for this student on this date across all their active batches (real, not virtual). Cancelled excluded. */
  sessions: { sessionId: string; batchId: string; batchName: string; type: 'recurring' | 'one-off' }[];
  /** Status per session (or null if unmarked). Length matches sessions. */
  statuses: (CellStatus | null)[];
  /** True if any session lands on a normal `daysOfWeek` day for its batch. Drives the dotted cyan border. */
  isNormalClassDay: boolean;
  /** True if any session is a one-off OR on a day outside the batch's normal `daysOfWeek` (a reschedule). Drives the dotted orange border. */
  isReschedule: boolean;
}

export function MonthlyCalendar() {
  const navigate = useNavigate();
  const students = useStore((s) => s.db.students);
  const batches = useStore((s) => s.db.batches);
  const memberships = useStore((s) => s.db.memberships);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const setAttendance = useStore((s) => s.setAttendance);
  const setAdhocAttendance = useStore((s) => s.setAdhocAttendance);
  const removeAttendance = useStore((s) => s.removeAttendance);
  const todayIso = todayISO();

  // Month nav state — defaults to today's month.
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

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
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
  const isCurrentMonth =
    viewYear === today.getFullYear() && viewMonth === today.getMonth();

  // Picker state — what the user is currently deciding attendance for.
  // Two stages: first pick which batch (if multiple sessions on that day, or empty class day),
  // then pick present/absent (or remove if existing record).
  const [pickerFor, setPickerFor] = useState<
    | { stage: 'pickBatch'; studentId: string; studentName: string; date: string; candidates: { batchId: string; batchName: string; sessionId: string | null; existing: 'present' | 'absent' | null }[] }
    | { stage: 'pickStatus'; studentId: string; studentName: string; date: string; batchId: string; batchName: string; sessionId: string | null; existing: 'present' | 'absent' | null }
    | null
  >(null);

  // Active students (alphabetical) with their batch-id set + per-batch day-of-week config.
  const studentRows = useMemo(() => {
    const activeBatches = batches.filter((b) => !b.archivedAt);
    const active = students.filter((s) => !s.archivedAt);
    active.sort((a, b) => a.name.localeCompare(b.name));
    return active
      .map((s) => {
        const studentBatchIds = new Set(
          memberships
            .filter((m) => m.studentId === s.id && m.removedDate === null)
            .map((m) => m.batchId)
        );
        const studentBatches = activeBatches.filter((b) => studentBatchIds.has(b.id));
        return { id: s.id, name: s.name, batches: studentBatches };
      })
      .filter((row) => row.batches.length > 0); // skip students with no active batches — nothing to show
  }, [students, batches, memberships, viewYear, viewMonth]);

  // Pre-compute sessions by (batch, date) for the entire month, once. Used by every student row.
  const monthSessionsByBatchDate = useMemo(() => {
    const fromStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
    const toStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const map = new Map<string, ReturnType<typeof useStore.getState>['db']['sessions'][number]>();
    const activeBatches = batches.filter((b) => !b.archivedAt);
    for (const batch of activeBatches) {
      const list = findOrCreateRecurringSessions(batch, sessions, fromStr, toStr);
      for (const sess of list) {
        // Prefer the stored session; virtual entries have id starting with 'virtual-'.
        const real = sess.id.startsWith('virtual-')
          ? sessions.find((s) => s.batchId === batch.id && s.date === sess.date && s.type === 'recurring')
          : sess;
        if (!real) continue;
        if (real.status === 'cancelled') continue; // cancelled sessions don't appear in the calendar
        map.set(`${batch.id}|${sess.date}`, real);
      }
    }
    return map;
  }, [batches, sessions, viewYear, viewMonth, daysInMonth]);

  // Compute one DayCell per (student, day) for the entire month.
  const gridByStudent = useMemo(() => {
    const result = new Map<string, Map<number, DayCell>>();
    for (const row of studentRows) {
      const dayMap = new Map<number, DayCell>();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayOfWeek = parseISODate(dateStr).getDay();
        const sessionsForDay: DayCell['sessions'] = [];
        const statuses: (CellStatus | null)[] = [];
        let isNormalClassDay = false;
        let isReschedule = false;
        for (const batch of row.batches) {
          const sess = monthSessionsByBatchDate.get(`${batch.id}|${dateStr}`);
          if (!sess) continue;
          sessionsForDay.push({
            sessionId: sess.id,
            batchId: batch.id,
            batchName: batch.name,
            type: sess.type,
          });
          const att = attendance.find((a) => a.sessionId === sess.id && a.studentId === row.id);
          statuses.push(att?.status ?? null);
          const isBatchDayByDow = batch.daysOfWeek.includes(dayOfWeek);
          if (isBatchDayByDow) isNormalClassDay = true;
          if (sess.type === 'one-off' || !isBatchDayByDow) isReschedule = true;
        }
        dayMap.set(d, {
          sessions: sessionsForDay,
          statuses,
          isNormalClassDay,
          isReschedule,
        });
      }
      result.set(row.id, dayMap);
    }
    return result;
  }, [studentRows, monthSessionsByBatchDate, attendance, viewYear, viewMonth, daysInMonth]);

  // Tap handler — figure out what picker to show based on cell content.
  const handleCellTap = (studentId: string, studentName: string, date: string, cell: DayCell) => {
    // Case A: no real session on this day.
    if (cell.sessions.length === 0) {
      // Find batches that SHOULD run on this day (so we can offer adhoc attendance).
      const dayOfWeek = parseISODate(date).getDay();
      const adhocCandidates = studentRows
        .find((r) => r.id === studentId)
        ?.batches.filter((b) => b.daysOfWeek.includes(dayOfWeek))
        .map((b) => ({ batchId: b.id, batchName: b.name, sessionId: null, existing: null as null })) ?? [];
      if (adhocCandidates.length === 0) return; // truly nothing to mark — don't open a picker
      if (adhocCandidates.length === 1) {
        setPickerFor({
          stage: 'pickStatus',
          studentId,
          studentName,
          date,
          batchId: adhocCandidates[0].batchId,
          batchName: adhocCandidates[0].batchName,
          sessionId: null,
          existing: null,
        });
      } else {
        setPickerFor({ stage: 'pickBatch', studentId, studentName, date, candidates: adhocCandidates });
      }
      return;
    }

    // Case B: one session — go straight to status picker.
    if (cell.sessions.length === 1) {
      const sess = cell.sessions[0];
      const att = attendance.find((a) => a.sessionId === sess.sessionId && a.studentId === studentId);
      setPickerFor({
        stage: 'pickStatus',
        studentId,
        studentName,
        date,
        batchId: sess.batchId,
        batchName: sess.batchName,
        sessionId: sess.sessionId,
        existing: (att?.status as 'present' | 'absent' | null) ?? null,
      });
      return;
    }

    // Case C: multiple sessions on the same day — pick which batch first.
    const candidates = cell.sessions.map((sess) => {
      const att = attendance.find((a) => a.sessionId === sess.sessionId && a.studentId === studentId);
      return {
        batchId: sess.batchId,
        batchName: sess.batchName,
        sessionId: sess.sessionId,
        existing: (att?.status as 'present' | 'absent' | null) ?? null,
      };
    });
    setPickerFor({ stage: 'pickBatch', studentId, studentName, date, candidates });
  };

  const handlePickBatch = (batchId: string, batchName: string, sessionId: string | null, existing: 'present' | 'absent' | null) => {
    if (!pickerFor || pickerFor.stage !== 'pickBatch') return;
    setPickerFor({
      stage: 'pickStatus',
      studentId: pickerFor.studentId,
      studentName: pickerFor.studentName,
      date: pickerFor.date,
      batchId,
      batchName,
      sessionId,
      existing,
    });
  };

  const handlePickStatus = (status: 'present' | 'absent') => {
    if (!pickerFor || pickerFor.stage !== 'pickStatus') return;
    if (pickerFor.sessionId) {
      // Existing scheduled session — set/change attendance directly.
      setAttendance(pickerFor.sessionId, pickerFor.studentId, status);
    } else {
      // Adhoc attendance — ensure session then mark.
      setAdhocAttendance(pickerFor.batchId, pickerFor.studentId, pickerFor.date, status);
    }
    setPickerFor(null);
  };

  const handleRemove = () => {
    if (!pickerFor || pickerFor.stage !== 'pickStatus' || !pickerFor.existing) return;
    const record = attendance.find((a) => {
      if (pickerFor.sessionId) return a.sessionId === pickerFor.sessionId && a.studentId === pickerFor.studentId;
      // Adhoc — find by (student, batch, date).
      const sess = sessions.find((s) => s.batchId === pickerFor.batchId && s.date === pickerFor.date);
      return sess ? a.sessionId === sess.id && a.studentId === pickerFor.studentId : false;
    });
    if (!record) return;
    if (confirm(`Remove this attendance mark? (${record.status} on ${formatISODate(pickerFor.date)})`)) {
      removeAttendance(record.id);
      setPickerFor(null);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted">Monthly attendance</h2>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} aria-label="Previous month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">‹</button>
          <button onClick={goToday} disabled={isCurrentMonth} className="text-[10px] uppercase tracking-wider font-bold text-neon-green disabled:opacity-40 disabled:cursor-default">Today</button>
          <button onClick={goNext} aria-label="Next month" className="w-7 h-7 rounded-full bg-bg-card border border-border text-fg-secondary hover:text-fg-primary">›</button>
        </div>
      </div>
      <div className="text-sm font-semibold mb-3">{monthLabel}</div>

      {studentRows.length === 0 ? (
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">Add students and assign them to batches to see the monthly snapshot.</div>
        </Card>
      ) : (
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
          <div className="min-w-[640px]">
            {/* Day-number header — shared across all student rows. */}
            <div
              className="grid mb-1"
              style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(18px, 1fr))` }}
            >
              <div />
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <div key={d} className="text-center text-[9px] text-fg-muted">{d}</div>
              ))}
            </div>
            {/* One row per student. */}
            {studentRows.map((row) => (
              <div
                key={row.id}
                className="grid items-center"
                style={{ gridTemplateColumns: `120px repeat(${daysInMonth}, minmax(18px, 1fr))` }}
              >
                <button
                  onClick={() => navigate(`/students/${row.id}`)}
                  className="text-[11px] text-fg-secondary truncate pr-2 text-left hover:text-fg-primary"
                  title={`Open ${row.name}'s detail`}
                >
                  {row.name}
                </button>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                  const cell = gridByStudent.get(row.id)?.get(d);
                  if (!cell) return <div key={d} className="h-6 mx-0.5" />;
                  const isFuture = dateStr > todayIso;

                  // Subtle day indicator(s) — tiny dots at the top of the cell. One cyan dot
                  // per batch that has this day in its daysOfWeek (multi-batch stacks multiple
                  // dots); one orange dot if any session is a reschedule (one-off or a session
                  // scheduled on a non-daysOfWeek day).
                  const dots: ReactElement[] = [];
                  // Count how many of the student's batches have this day as a class day.
                  const normalBatchCount = row.batches.filter((b) => b.daysOfWeek.includes(parseISODate(dateStr).getDay())).length;
                  for (let i = 0; i < Math.min(normalBatchCount, 2); i++) {
                    dots.push(<span key={`c${i}`} aria-hidden="true" className="w-1 h-1 rounded-full bg-neon-cyan/70" />);
                  }
                  if (cell.isReschedule) {
                    dots.push(<span key="r" aria-hidden="true" className="w-1 h-1 rounded-full bg-neon-orange/80" />);
                  }
                  const indicator = dots.length > 0 ? (
                    <span aria-hidden="true" className="absolute top-0.5 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {dots}
                    </span>
                  ) : null;

                  // Multi-session stacked rendering — show up to 2 small marks (✓/✗/dot).
                  if (cell.sessions.length >= 2) {
                    const marks = cell.sessions.slice(0, 2).map((_sess, i) => {
                      const st = cell.statuses[i];
                      if (st === 'present') return <span key={i} className="text-neon-green font-bold">✓</span>;
                      if (st === 'absent') return <span key={i} className="text-neon-pink font-bold">✗</span>;
                      return <span key={i} className="text-fg-muted">·</span>;
                    });
                    const allPresent = cell.statuses.every((s) => s === 'present');
                    const allAbsent = cell.statuses.every((s) => s === 'absent');
                    const bg = allPresent
                      ? 'bg-neon-green text-bg-base'
                      : allAbsent
                      ? 'bg-neon-pink text-bg-base'
                      : cell.statuses.includes('present') && cell.statuses.includes('absent')
                      ? 'bg-gradient-to-r from-neon-green from-50% via-bg-card via-50% to-neon-pink text-bg-base'
                      : 'bg-bg-card text-fg-secondary border border-border';
                    return (
                      <button
                        key={d}
                        onClick={() => handleCellTap(row.id, row.name, dateStr, cell)}
                        className={`relative h-6 mx-0.5 rounded ${bg} flex items-center justify-center gap-0.5 text-[10px] font-bold active:scale-95`}
                        title={`${row.name} · ${formatISODate(dateStr)} · ${cell.sessions.length} sessions${cell.isReschedule ? ' · rescheduled' : ''}`}
                      >
                        {indicator}
                        {marks}
                      </button>
                    );
                  }

                  // Single-session or no-session rendering.
                  if (cell.sessions.length === 1) {
                    const st = cell.statuses[0];
                    const bg =
                      st === 'present'
                        ? 'bg-neon-green text-bg-base'
                        : st === 'absent'
                        ? 'bg-neon-pink text-bg-base'
                        : 'bg-bg-card text-fg-secondary border border-border';
                    const mark = st === 'present' ? '✓' : st === 'absent' ? '✗' : '';
                    return (
                      <button
                        key={d}
                        onClick={() => handleCellTap(row.id, row.name, dateStr, cell)}
                        className={`relative h-6 mx-0.5 rounded ${bg} flex items-center justify-center text-[10px] font-bold active:scale-95`}
                        title={`${row.name} · ${formatISODate(dateStr)} · ${cell.sessions[0].batchName}${st ? ` · ${st}` : ''}${cell.isReschedule ? ' · rescheduled' : ''}`}
                      >
                        {indicator}
                        {mark}
                      </button>
                    );
                  }

                  // No session on this day — but it IS a normal class day for one of the student's batches.
                  if (cell.isNormalClassDay) {
                    return (
                      <button
                        key={d}
                        onClick={() => handleCellTap(row.id, row.name, dateStr, cell)}
                        className={`relative h-6 mx-0.5 rounded bg-transparent flex items-center justify-center text-[10px] active:scale-95`}
                        title={`${row.name} · ${formatISODate(dateStr)} · ${isFuture ? 'upcoming class' : 'unmarked class — tap to add'}`}
                        aria-label={`${isFuture ? 'Upcoming' : 'Unmarked'} class day for ${row.name}`}
                      >
                        {indicator}
                      </button>
                    );
                  }

                  // Nothing scheduled, not a class day — dim empty cell.
                  return <div key={d} className="h-6 mx-0.5 rounded bg-bg-card opacity-40" />;
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] uppercase tracking-wider text-fg-muted">
        <div className="flex items-center gap-1"><span className="font-bold text-neon-green">✓</span>Present</div>
        <div className="flex items-center gap-1"><span className="font-bold text-neon-pink">✗</span>Absent</div>
        <div className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-bg-card border border-border" />Unmarked</div>
        <div className="flex items-center gap-1"><span className="inline-block w-1 h-1 rounded-full bg-neon-cyan/70" />Class day</div>
        <div className="flex items-center gap-1"><span className="inline-block w-1 h-1 rounded-full bg-neon-orange/80" />Rescheduled</div>
      </div>

      {/* Picker modal — two stages: pick a batch (if multiple candidates), then pick status. */}
      {pickerFor && pickerFor.stage === 'pickBatch' && (
        <Modal open onClose={() => setPickerFor(null)} title="Which batch?">
          <div className="space-y-3">
            <div className="text-sm text-fg-secondary">{formatISODateLong(pickerFor.date)} · {pickerFor.studentName}</div>
            <p className="text-xs text-fg-muted">
              {pickerFor.candidates.length > 1 ? 'Multiple sessions for this student on this day. Pick one to mark.' : 'Pick a batch to record an extra session on this day.'}
            </p>
            <div className="space-y-2">
              {pickerFor.candidates.map((c) => (
                <button
                  key={c.batchId}
                  onClick={() => handlePickBatch(c.batchId, c.batchName, c.sessionId, c.existing)}
                  className="w-full text-left px-4 py-3 bg-bg-card hover:bg-bg-card-hover border border-border rounded-xl flex items-center justify-between"
                >
                  <span className="font-semibold">{c.batchName}</span>
                  <span className={`text-[10px] uppercase tracking-wider font-bold ${c.existing === 'present' ? 'text-neon-green' : c.existing === 'absent' ? 'text-neon-pink' : 'text-fg-muted'}`}>
                    {c.existing ?? c.sessionId ? (c.existing ? `· ${c.existing}` : '· scheduled') : '· add adhoc'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {pickerFor && pickerFor.stage === 'pickStatus' && (
        <Modal
          open
          onClose={() => setPickerFor(null)}
          title={
            pickerFor.sessionId
              ? pickerFor.existing
                ? 'Edit attendance'
                : 'Mark attendance'
              : 'Add attendance'
          }
        >
          <div className="space-y-3">
            <div className="text-sm text-fg-secondary">
              {formatISODateLong(pickerFor.date)} · {pickerFor.batchName}
            </div>
            {!pickerFor.sessionId && (
              <p className="text-xs text-fg-muted">
                No class scheduled for this batch on this day. Pick a status to record an extra session.
              </p>
            )}
            {pickerFor.existing && (
              <div className="text-xs text-fg-muted">
                Currently marked{' '}
                <span
                  className={
                    pickerFor.existing === 'present'
                      ? 'text-neon-green font-bold'
                      : 'text-neon-pink font-bold'
                  }
                >
                  {pickerFor.existing}
                </span>
                . Pick a new status or remove it.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="danger" onClick={() => handlePickStatus('absent')} className="!py-4">✗ Absent</Button>
              <Button onClick={() => handlePickStatus('present')} className="!py-4">✓ Present</Button>
            </div>
            {pickerFor.existing && (
              <Button variant="ghost" onClick={handleRemove} className="w-full !text-neon-pink">
                🗑 Remove this mark
              </Button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}