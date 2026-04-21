import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useStore from './store/useStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import AuthCallback from './pages/AuthCallback';
import Dashboard from './pages/Dashboard';
import CalendarPage from './pages/CalendarPage';
import TasksPage from './pages/TasksPage';
import TestsPage from './pages/TestsPage';
import Settings from './pages/Settings';

function ProtectedRoute({ children }) {
  const token = useStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { token, setAuth } = useStore();

  useEffect(() => {
    if (token) localStorage.setItem('acadex_token', token);
  }, [token]);

  return (
    <BrowserRouter>
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
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
