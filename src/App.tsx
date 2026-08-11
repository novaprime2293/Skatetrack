import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './data/store';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './pages/HomePage';
import { StudentsPage } from './pages/StudentsPage';
import { ChartPage } from './pages/ChartPage';
import { BatchesPage } from './pages/BatchesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { AttendanceFlowPage } from './pages/AttendanceFlowPage';
import { MissedAttendanceModal } from './components/MissedAttendanceModal';
import { SettingsPage } from './pages/SettingsPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { scanAndNotify, clearAllNotified } from './data/notifications';

export function App() {
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const batches = useStore((s) => s.db.batches);
  const students = useStore((s) => s.db.students);
  const sessions = useStore((s) => s.db.sessions);
  const attendance = useStore((s) => s.db.attendance);
  const location = useLocation();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (hydrated && !onboardingChecked) {
      if (batches.length === 0 && students.length === 0) {
        setShowOnboarding(true);
      }
      setOnboardingChecked(true);
    }
  }, [hydrated, onboardingChecked, batches.length, students.length]);

  // End-of-class notification loop — fires at most once per (session, OS session).
  useEffect(() => {
    if (!hydrated) return;
    clearAllNotified();
    const tick = () => {
      scanAndNotify(sessions, attendance, batches, 5);
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hydrated, sessions, attendance, batches]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base text-fg-muted">
        <div className="text-sm uppercase tracking-[0.3em]">Loading…</div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingPage onDone={() => setShowOnboarding(false)} />;
  }

  const hideNav = location.pathname.startsWith('/attendance/');

  return (
    <div className="min-h-screen bg-bg-base text-fg-primary flex flex-col">
      <div className="flex-1 max-w-2xl w-full mx-auto pb-24">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/students/:studentId" element={<StudentsPage />} />
          <Route path="/batches" element={<BatchesPage />} />
          <Route path="/chart" element={<ChartPage />} />
          <Route path="/payments" element={<PaymentsPage />} />
          <Route path="/attendance/:sessionId" element={<AttendanceFlowPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!hideNav && <BottomNav />}
      <MissedAttendanceModal />
    </div>
  );
}
