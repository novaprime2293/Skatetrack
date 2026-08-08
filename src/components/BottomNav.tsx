import { NavLink } from 'react-router-dom';
import clsx from 'clsx';

const tabs = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/students', label: 'Students', icon: PersonIcon },
  { to: '/batches', label: 'Batches', icon: GroupIcon },
  { to: '/chart', label: 'Chart', icon: ChartIcon },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-bg-elevated/95 backdrop-blur-md">
      <div className="max-w-2xl mx-auto grid grid-cols-4">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center justify-center gap-1 py-3 transition-colors',
                isActive ? 'text-neon-green' : 'text-fg-muted hover:text-fg-secondary'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon active={isActive} />
                <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

function IconWrap({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <div
      className={clsx(
        'w-9 h-9 rounded-full flex items-center justify-center transition-all',
        active && 'bg-neon-green/10 ring-1 ring-neon-green/40'
      )}
    >
      {children}
    </div>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <IconWrap active={active}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12L12 3l9 9" />
        <path d="M5 10v10h14V10" />
      </svg>
    </IconWrap>
  );
}

function PersonIcon({ active }: { active: boolean }) {
  return (
    <IconWrap active={active}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    </IconWrap>
  );
}

function GroupIcon({ active }: { active: boolean }) {
  return (
    <IconWrap active={active}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="9" r="3.5" />
        <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
        <circle cx="17" cy="7" r="2.5" />
        <path d="M22 18c0-2.5-2.2-4.5-5-4.5" />
      </svg>
    </IconWrap>
  );
}

function ChartIcon({ active }: { active: boolean }) {
  return (
    <IconWrap active={active}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21h18" />
        <rect x="5" y="13" width="3" height="6" />
        <rect x="10.5" y="9" width="3" height="10" />
        <rect x="16" y="5" width="3" height="14" />
      </svg>
    </IconWrap>
  );
}
