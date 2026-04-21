import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useStore from '../store/useStore';
import api from '../utils/api';

export default function AuthCallback() {
  const [params] = useSearchParams();
  const { setAuth } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    const token = params.get('token');
    if (!token) { navigate('/login'); return; }

    localStorage.setItem('acadex_token', token);
    api.get('/auth/me').then((user) => {
      setAuth(token, user);
      navigate('/dashboard');
    }).catch(() => navigate('/login'));
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}
