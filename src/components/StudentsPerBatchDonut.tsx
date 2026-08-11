import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../data/store';
import { Card } from './ui';

interface Slice {
  batchId: string;
  batchName: string;
  count: number;
  color: string;
}

// Pre-pick visually distinct neon colors that read well on the dark card surface.
const PALETTE = [
  '#39ff14', // neon green
  '#ff2e93', // neon pink
  '#faff00', // neon yellow
  '#00f0ff', // neon cyan
  '#ff6b1a', // neon orange
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb7185', // rose
];

interface ArcGeometry {
  d: string;
}

// Returns an SVG arc path from (0,0) center; angles in degrees, 0 = up, clockwise.
function arcPath(startAngle: number, endAngle: number, innerR: number, outerR: number): ArcGeometry {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = Math.cos(toRad(startAngle)) * outerR;
  const y1 = Math.sin(toRad(startAngle)) * outerR;
  const x2 = Math.cos(toRad(endAngle)) * outerR;
  const y2 = Math.sin(toRad(endAngle)) * outerR;
  const x3 = Math.cos(toRad(endAngle)) * innerR;
  const y3 = Math.sin(toRad(endAngle)) * innerR;
  const x4 = Math.cos(toRad(startAngle)) * innerR;
  const y4 = Math.sin(toRad(startAngle)) * innerR;
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return {
    d: [
      `M ${x1} ${y1}`,
      `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x3} ${y3}`,
      `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
      'Z',
    ].join(' '),
  };
}

// Build a full-ring path (when one slice covers the whole donut).
function fullRingPath(innerR: number, outerR: number): ArcGeometry {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const outerStart = `M ${Math.cos(toRad(0)) * outerR} ${Math.sin(toRad(0)) * outerR}`;
  const outerEnd = `A ${outerR} ${outerR} 0 1 1 ${Math.cos(toRad(359.99)) * outerR} ${Math.sin(toRad(359.99)) * outerR}`;
  const innerStart = `M ${Math.cos(toRad(359.99)) * innerR} ${Math.sin(toRad(359.99)) * innerR}`;
  const innerEnd = `A ${innerR} ${innerR} 0 1 1 ${Math.cos(toRad(0)) * innerR} ${Math.sin(toRad(0)) * innerR}`;
  return {
    d: [outerStart, outerEnd, 'Z', innerStart, innerEnd, 'Z'].join(' '),
  };
}

export function StudentsPerBatchDonut() {
  const navigate = useNavigate();
  const batches = useStore((s) => s.db.batches);
  const memberships = useStore((s) => s.db.memberships);
  const students = useStore((s) => s.db.students);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const slices: Slice[] = useMemo(() => {
    const activeBatches = batches.filter((b) => !b.archivedAt);
    const activeStudentIds = new Set(students.filter((s) => !s.archivedAt).map((s) => s.id));
    return activeBatches.map((b, idx) => {
      const count = memberships.filter(
        (m) =>
          m.batchId === b.id &&
          m.removedDate === null &&
          activeStudentIds.has(m.studentId),
      ).length;
      return { batchId: b.id, batchName: b.name, count, color: PALETTE[idx % PALETTE.length] };
    });
  }, [batches, memberships, students]);

  const total = slices.reduce((sum, s) => sum + s.count, 0);
  const radius = 70;
  const innerRadius = 42;
  const size = radius * 2 + 20;
  const center = size / 2;

  if (slices.length === 0 || total === 0) {
    return (
      <div className="mb-6">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-3">Students per batch</h2>
        <Card>
          <div className="text-center py-6 text-fg-muted text-sm">No active batches with students.</div>
        </Card>
      </div>
    );
  }

  // Compute slice angles
  let cursor = 0;
  const arcs = slices.map((slice, idx) => {
    const sweep = (slice.count / total) * 360;
    const start = cursor;
    const end = cursor + sweep;
    cursor = end;
    const arc = sweep >= 359.99
      ? fullRingPath(innerRadius, radius)
      : arcPath(start, end, innerRadius, radius);
    return { slice, arc, idx };
  });

  return (
    <div className="mb-6">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-fg-muted mb-3">Students per batch</h2>
      <Card>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`-${center} -${center} ${size} ${size}`}>
              {arcs.map(({ slice, arc, idx }) => (
                <path
                  key={slice.batchId}
                  d={arc.d}
                  fill={slice.color}
                  opacity={hoverIdx === null || hoverIdx === idx ? 1 : 0.4}
                  stroke="#0a0a0f"
                  strokeWidth={1}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => navigate(`/students?batch=${slice.batchId}`)}
                />
              ))}
              <text
                x="0"
                y="0"
                textAnchor="middle"
                dominantBaseline="central"
                fill="#f5f5fa"
                fontSize="22"
                fontWeight="800"
              >
                {total}
              </text>
            </svg>
          </div>
          <div className="flex-1 min-w-0 w-full">
            <div className="space-y-1.5">
              {arcs.map(({ slice, idx }) => (
                <button
                  key={slice.batchId}
                  onClick={() => navigate(`/students?batch=${slice.batchId}`)}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onMouseLeave={() => setHoverIdx(null)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    hoverIdx === idx ? 'bg-bg-card-hover' : ''
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                      style={{ background: slice.color }}
                    />
                    <span className="text-sm text-fg-primary truncate">{slice.batchName}</span>
                  </span>
                  <span className="text-sm font-bold text-fg-secondary">{slice.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}