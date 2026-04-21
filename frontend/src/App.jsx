import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useStore from './store/useStore';
import useThemeStore from './store/useThemeStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import SchedulePage from './pages/SchedulePage';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import TestsPage from './pages/TestsPage';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const token = useStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function ThemeApplier() {
  const colors = useThemeStore((s) => s.colors);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--bg-primary',    colors.bgPrimary);
    root.style.setProperty('--bg-secondary',  colors.bgSecondary);
    root.style.setProperty('--bg-tertiary',   colors.bgTertiary);
    root.style.setProperty('--accent',        colors.accent);
    root.style.setProperty('--color-task',    colors.colorTask);
    root.style.setProperty('--color-personal',colors.colorPersonal);
    root.style.setProperty('--color-canvas',  colors.colorCanvas);
    root.style.setProperty('--color-test',    colors.colorTest);
    root.style.setProperty('--color-block',   colors.colorBlock);
    root.style.setProperty('--color-google',  colors.colorGoogle);
  }, [colors]);
  return null;
}

export default function App() {
  const { token } = useStore();

  useEffect(() => {
    if (token) localStorage.setItem('acadex_token', token);
  }, [token]);

  return (
    <BrowserRouter>
      <ThemeApplier />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
