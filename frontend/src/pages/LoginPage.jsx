import { GraduationCap, Zap } from 'lucide-react';
import api from '../utils/api';
import useStore from '../store/useStore';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { setAuth } = useStore();
  const navigate = useNavigate();

  const handleGoogle = async () => {
    try {
      const { url } = await api.get('/auth/google');
      window.location.href = url;
    } catch {
      toast.error('Google login unavailable. Try demo mode.');
    }
  };

  const handleDemo = async () => {
    try {
      const { token, user } = await api.post('/auth/demo');
      localStorage.setItem('acadex_token', token);
      setAuth(token, user);
      navigate('/dashboard');
    } catch (err) {
      toast.error('Demo login failed. Is the backend running?');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-500 rounded-2xl mb-4 shadow-lg shadow-brand-500/30">
            <GraduationCap size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Acadex</h1>
          <p className="text-gray-400">Your AI-powered student productivity hub</p>
        </div>

        {/* Card */}
        <div className="card space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-gray-400 bg-gray-800/60 rounded-lg p-3">
              <Zap size={14} className="text-brand-400 shrink-0" />
              <span>AI scheduling, Canvas sync, Google Calendar integration</span>
            </div>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 hover:bg-gray-100 font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
            </svg>
            Sign in with Google
          </button>

          <div className="relative flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-500">or</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>

          <button onClick={handleDemo} className="btn-secondary w-full py-2.5">
            Continue as Demo User
          </button>

          <p className="text-xs text-gray-500 text-center">
            Demo mode uses pre-seeded data so you can explore all features immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
