import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Key, RefreshCw, Check, ExternalLink, Zap, Calendar, BookOpen, Shield } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import useStore from '../store/useStore';

export default function Settings() {
  const { user, setAuth } = useStore();
  const qc = useQueryClient();
  const [canvasToken, setCanvasToken] = useState('');
  const [canvasDomain, setCanvasDomain] = useState(user?.canvasDomain || '');
  const [saved, setSaved] = useState(false);

  const { data: me } = useQuery({ queryKey: ['me'], queryFn: () => api.get('/auth/me') });

  const saveCanvas = useMutation({
    mutationFn: () => api.post('/auth/canvas-token', { token: canvasToken, domain: canvasDomain }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      setSaved(true);
      toast.success('Canvas connected! Syncing your assignments...');
      setTimeout(() => setSaved(false), 2000);
      // Auto-trigger sync a moment after saving so the updated user token is in DB
      setTimeout(() => syncCanvas.mutate(), 800);
    },
    onError: (err) => toast.error(err.error || 'Failed to save'),
  });

  const syncCanvas = useMutation({
    mutationFn: () => api.post('/canvas/sync'),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['canvas-assignments'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success(data.message || 'Canvas synced!');
    },
    onError: (err) => toast.error(err.error || 'Sync failed — check your token and domain'),
  });

  const connectGoogle = async () => {
    try {
      const { url } = await api.get('/auth/google');
      window.location.href = url;
    } catch {
      toast.error('Google OAuth not configured on server');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Profile */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Shield size={16} className="text-brand-400" /> Profile
        </h2>
        <div className="flex items-center gap-3">
          {user?.picture ? (
            <img src={user.picture} alt={user.name} className="w-12 h-12 rounded-full" />
          ) : (
            <div className="w-12 h-12 bg-brand-500 rounded-full flex items-center justify-center text-lg font-bold text-white">
              {user?.name?.[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-white">{user?.name}</p>
            <p className="text-sm text-gray-400">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Canvas LMS */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <BookOpen size={16} className="text-yellow-400" /> Canvas LMS Integration
        </h2>

        {me?.hasCanvas && (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
            <Check size={14} /> Canvas connected to <strong>{me.canvasDomain}</strong>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">Canvas Domain</label>
            <input
              className="input"
              placeholder="e.g., myschool.instructure.com"
              value={canvasDomain}
              onChange={e => setCanvasDomain(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">Your Canvas LMS domain (without https://)</p>
          </div>
          <div>
            <label className="label">Canvas Access Token</label>
            <input
              className="input font-mono"
              type="password"
              placeholder="Paste your Canvas API token"
              value={canvasToken}
              onChange={e => setCanvasToken(e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Generate at: <span className="text-brand-400">Canvas → Account → Settings → New Access Token</span>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => saveCanvas.mutate()}
              disabled={!canvasToken || !canvasDomain || saveCanvas.isPending}
              className="btn-primary flex items-center gap-1.5"
            >
              {saved ? <Check size={14} /> : <Key size={14} />}
              {saved ? 'Saved!' : 'Save Canvas Token'}
            </button>
            {me?.hasCanvas && (
              <button
                onClick={() => syncCanvas.mutate()}
                disabled={syncCanvas.isPending}
                className="btn-secondary flex items-center gap-1.5"
              >
                <RefreshCw size={14} className={syncCanvas.isPending ? 'animate-spin' : ''} />
                {syncCanvas.isPending ? 'Syncing...' : 'Sync Now'}
              </button>
            )}
          </div>
        </div>

        <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3">
          Auto-sync runs every <strong>10 minutes</strong>. Canvas assignments appear in your Tasks page and Calendar.
        </div>
      </section>

      {/* Google Calendar */}
      <section className="card space-y-4">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Calendar size={16} className="text-blue-400" /> Google Calendar
        </h2>

        {user?.googleId ? (
          <div className="flex items-center gap-2 text-sm text-green-400 bg-green-400/10 border border-green-400/20 rounded-lg px-3 py-2">
            <Check size={14} /> Google Calendar connected
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Connect your Google Calendar to import events and push AI-generated study sessions.</p>
            <button onClick={connectGoogle} className="btn-primary flex items-center gap-2">
              <ExternalLink size={14} /> Connect Google Calendar
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3">
          Google Calendar events are imported in read-only mode. AI schedule sessions can be pushed to your calendar from the Calendar page.
        </div>
      </section>

      {/* AI Scheduler */}
      <section className="card space-y-3">
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Zap size={16} className="text-brand-400" /> AI Scheduler
        </h2>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span>AI Engine</span>
            <span className="text-gray-200">LLaMA 3 (Groq cloud or Ollama local)</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span>Daily limit</span>
            <span className="text-gray-200">6 hours productivity</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span>Session chunks</span>
            <span className="text-gray-200">30 – 90 minutes</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-800">
            <span>Break policy</span>
            <span className="text-gray-200">1 break per 2h work</span>
          </div>
          <div className="flex justify-between py-2">
            <span>Auto-regenerate</span>
            <span className="text-gray-200">Daily at midnight</span>
          </div>
        </div>
      </section>
    </div>
  );
}
