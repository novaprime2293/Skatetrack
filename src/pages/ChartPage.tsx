import { useState, useMemo } from 'react';
import { useStore } from '../data/store';
import { PageHeader, Card, Pill, SectionTitle } from '../components/ui';
import { findOrCreateRecurringSessions } from '../data/sessions';

type Range = 'week' | 'month' | 'all';

export function ChartPage() {
  const allBatches = useStore((s) => s.db.batches);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const students = useStore((s) => s.db.students);
  const batches = useMemo(() => allBatches.filter((b) => !b.archivedAt), [allBatches]);

  const [range, setRange] = useState<Range>('month');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);

  const { from, to } = useMemo(() => {
    const today = new Date();
    const toIso = today.toISOString().slice(0, 10);
    if (range === 'week') {
      const from = new Date(today);
      from.setDate(from.getDate() - 6);
      return { from: from.toISOString().slice(0, 10), to: toIso };
    }
    if (range === 'month') {
      const from = new Date(today);
      from.setDate(from.getDate() - 29);
      return { from: from.toISOString().slice(0, 10), to: toIso };
    }
    return { from: '2020-01-01', to: toIso };
  }, [range]);

  // Build "sessions to consider" — virtual + persisted — across the range
  const allSessions = useMemo(() => {
    const out: Array<{ id: string; batchId: string; date: string; status: string }> = [];
    const filtered = batchFilter ? batches.filter((b) => b.id === batchFilter) : batches;
    for (const b of filtered) {
      const list = findOrCreateRecurringSessions(b, sessions, from, to);
      for (const s of list) {
        out.push({ id: s.id, batchId: s.batchId, date: s.date, status: s.status });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [batches, sessions, from, to, batchFilter]);

  // Per-batch stats
  const perBatch = useMemo(() => {
    const map = new Map<string, { batchId: string; batchName: string; total: number; present: number; absent: number; cancelled: number }>();
    for (const b of batches) {
      map.set(b.id, { batchId: b.id, batchName: b.name, total: 0, present: 0, absent: 0, cancelled: 0 });
    }
    for (const sess of allSessions) {
      const entry = map.get(sess.batchId);
      if (!entry) continue;
      if (sess.status === 'cancelled') {
        entry.cancelled++;
        continue;
      }
      const sessionAtt = attendance.filter((a) => a.sessionId === sess.id);
      if (sessionAtt.length === 0) continue;
      entry.total++;
      entry.present += sessionAtt.filter((a) => a.status === 'present').length;
      entry.absent += sessionAtt.filter((a) => a.status === 'absent').length;
    }
    return [...map.values()].filter((e) => e.total + e.cancelled > 0);
  }, [batches, allSessions, attendance]);

  // Per-student ranking
  const perStudent = useMemo(() => {
    const map = new Map<string, { total: number; present: number; absent: number }>();
    for (const att of attendance) {
      const sess = sessions.find((s) => s.id === att.sessionId);
      if (!sess || sess.status === 'cancelled') continue;
      if (sess.date < from || sess.date > to) continue;
      const m = map.get(att.studentId) ?? { total: 0, present: 0, absent: 0 };
      m.total++;
      if (att.status === 'present') m.present++;
      else m.absent++;
      map.set(att.studentId, m);
    }
    const out = [...map.entries()]
      .map(([studentId, stats]) => {
        const student = students.find((s) => s.id === studentId);
        return {
          studentId,
          name: student?.name ?? 'Unknown',
          ...stats,
          rate: stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0,
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => a.rate - b.rate);
    return out;
  }, [attendance, sessions, students, from, to]);

  // Week-over-week (last 8 weeks)
  const trend = useMemo(() => {
    const weeks: Array<{ label: string; rate: number | null; total: number; present: number }> = [];
    const today = new Date();
    for (let i = 7; i >= 0; i--) {
      const weekEnd = new Date(today);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      const from = weekStart.toISOString().slice(0, 10);
      const to = weekEnd.toISOString().slice(0, 10);
      let total = 0;
      let present = 0;
      for (const att of attendance) {
        const sess = sessions.find((s) => s.id === att.sessionId);
        if (!sess || sess.status === 'cancelled') continue;
        if (sess.date < from || sess.date > to) continue;
        total++;
        if (att.status === 'present') present++;
      }
      const rate = total > 0 ? Math.round((present / total) * 100) : null;
      const label = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
      weeks.push({ label, rate, total, present });
    }
    return weeks;
  }, [attendance, sessions]);

  return (
    <div className="px-4 pb-12">
      <PageHeader title="Chart" subtitle="Attendance trends" />

      <Card className="mb-4">
        <div className="flex gap-1.5 mb-3">
          {(['week', 'month', 'all'] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`flex-1 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${
                range === r ? 'bg-neon-green text-bg-base border-neon-green' : 'bg-bg-card border-border text-fg-secondary'
              }`}
            >
              {r === 'week' ? '7d' : r === 'month' ? '30d' : 'All'}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1">
          <button
            onClick={() => setBatchFilter(null)}
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
              batchFilter === null ? 'bg-neon-cyan text-bg-base border-neon-cyan' : 'bg-bg-card border-border text-fg-secondary'
            }`}
          >
            All batches
          </button>
          {batches.map((b) => (
            <button
              key={b.id}
              onClick={() => setBatchFilter(b.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border whitespace-nowrap ${
                batchFilter === b.id ? 'bg-neon-cyan text-bg-base border-neon-cyan' : 'bg-bg-card border-border text-fg-secondary'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      </Card>

      <SectionTitle>Week-over-week</SectionTitle>
      <Card className="mb-6">
        <div className="flex items-end justify-between gap-1 h-32">
          {trend.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="text-[10px] font-bold text-neon-green">{w.rate !== null ? `${w.rate}%` : ''}</div>
              <div className="w-full bg-bg-base rounded-md relative overflow-hidden" style={{ height: '80px' }}>
                <div
                  className="absolute bottom-0 left-0 right-0 bg-neon-green transition-all"
                  style={{ height: `${w.rate ?? 0}%`, opacity: w.rate === null ? 0.2 : 0.8 }}
                />
              </div>
              <div className="text-[9px] text-fg-muted whitespace-nowrap">{w.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <SectionTitle>By batch</SectionTitle>
      {perBatch.length === 0 ? (
        <Card><div className="text-sm text-fg-muted text-center py-4">No attendance data yet.</div></Card>
      ) : (
        <div className="space-y-2 mb-6">
          {perBatch.map((b) => {
            const rate = b.total > 0 ? Math.round((b.present / (b.present + b.absent)) * 100) : 0;
            return (
              <Card key={b.batchId}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold truncate">{b.batchName}</div>
                  <Pill color={rate >= 80 ? 'green' : rate >= 60 ? 'yellow' : 'pink'}>{rate}%</Pill>
                </div>
                <div className="h-1.5 bg-bg-base rounded-full overflow-hidden">
                  <div className="h-full bg-neon-green transition-all" style={{ width: `${rate}%` }} />
                </div>
                <div className="text-xs text-fg-muted mt-2">
                  {b.present} present · {b.absent} absent · {b.cancelled} cancelled · {b.total} sessions
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <SectionTitle>Students ranked by attendance</SectionTitle>
      {perStudent.length === 0 ? (
        <Card><div className="text-sm text-fg-muted text-center py-4">No attendance records yet.</div></Card>
      ) : (
        <div className="space-y-1.5">
          {perStudent.map((s) => (
            <Card key={s.studentId} className="!p-3">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{s.name}</div>
                  <div className="text-xs text-fg-muted">{s.present}/{s.total} classes</div>
                </div>
                <Pill color={s.rate >= 80 ? 'green' : s.rate >= 60 ? 'yellow' : 'pink'}>{s.rate}%</Pill>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
