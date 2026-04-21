import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Zap, BookOpen, CheckSquare, AlertTriangle, Clock, Sparkles, RefreshCw } from 'lucide-react';
import api from '../utils/api';
import useStore from '../store/useStore';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const priorityColors = {
  high: 'text-red-400 bg-red-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  low: 'text-green-400 bg-green-400/10',
  critical: 'text-purple-400 bg-purple-400/10',
};

const typeColors = {
  study: 'text-blue-400',
  assignment: 'text-yellow-400',
  review: 'text-purple-400',
  personal: 'text-green-400',
};

export default function Dashboard() {
  const { user } = useStore();
  const qc = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard/summary'),
  });

  const { data: schedule } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.get('/schedule'),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/schedule/generate'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      toast.success('AI schedule generated!');
    },
    onError: (err) => {
      const msg = err.error || err.message || 'Failed to generate schedule';
      if (msg.includes('No AI provider')) {
        toast.error('No AI provider configured. Add a GROQ_API_KEY (free at console.groq.com) or install Ollama locally.', { duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    },
  });

  const completeTask = useMutation({
    mutationFn: (id) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  if (isLoading) return <LoadingSkeleton />;

  const today = format(new Date(), 'EEEE, MMMM d');
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = schedule?.weekPlan?.week_plan?.find(d => d.date === todayStr);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Good {getGreeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-gray-400 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="btn-primary flex items-center gap-2"
        >
          {generateMutation.isPending ? (
            <RefreshCw size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {generateMutation.isPending ? 'Generating...' : 'Generate AI Schedule'}
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          icon={<CheckSquare size={20} className="text-brand-400" />}
          label="Pending Tasks"
          value={summary?.stats?.pendingTasks ?? 0}
          sub="need attention"
        />
        <StatCard
          icon={<BookOpen size={20} className="text-red-400" />}
          label="Upcoming Tests"
          value={summary?.stats?.upcomingTestsCount ?? 0}
          sub="this week"
          accent="red"
        />
        <StatCard
          icon={<AlertTriangle size={20} className="text-yellow-400" />}
          label="Canvas Due"
          value={summary?.stats?.canvasDueCount ?? 0}
          sub="next 7 days"
          accent="yellow"
        />
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Today's AI Schedule */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Zap size={16} className="text-brand-400" /> Today's AI Schedule
            </h2>
            {!todaySchedule && (
              <span className="text-xs text-gray-500">No schedule yet</span>
            )}
          </div>

          {todaySchedule?.tasks?.length ? (
            <div className="space-y-2">
              {todaySchedule.tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-800/50 rounded-lg">
                  <div className="text-xs text-gray-500 w-20 shrink-0 font-mono">
                    {task.start_time} – {task.end_time}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{task.title}</p>
                  </div>
                  <span className={clsx('text-xs font-medium', typeColors[task.type] || 'text-gray-400')}>
                    {task.type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Click "Generate AI Schedule" to get your personalized plan</p>
            </div>
          )}
        </div>

        {/* Due Today */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={16} className="text-yellow-400" /> Due Today
          </h2>
          {summary?.dueTodayTasks?.length ? (
            <div className="space-y-2">
              {summary.dueTodayTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3 p-2.5 bg-gray-800/50 rounded-lg group">
                  <button
                    onClick={() => completeTask.mutate(task.id)}
                    className="w-4 h-4 rounded border-2 border-gray-600 group-hover:border-brand-400 transition-colors shrink-0"
                  />
                  <span className="flex-1 text-sm text-gray-200">{task.title}</span>
                  <span className={clsx('badge text-xs', priorityColors[task.priority])}>
                    {task.priority}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <CheckSquare size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nothing due today!</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Upcoming Tests */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BookOpen size={16} className="text-red-400" /> Upcoming Tests
          </h2>
          {summary?.upcomingTests?.length ? (
            <div className="space-y-2">
              {summary.upcomingTests.map(test => (
                <div key={test.id} className="flex items-center justify-between p-2.5 bg-gray-800/50 rounded-lg">
                  <div>
                    <p className="text-sm text-gray-200 font-medium">{test.subject}</p>
                    <p className="text-xs text-gray-500">{formatDistanceToNow(new Date(test.date), { addSuffix: true })}</p>
                  </div>
                  <span className={clsx('badge', priorityColors[test.importanceLevel] || priorityColors.medium)}>
                    {test.importanceLevel}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">No upcoming tests</p>
          )}
        </div>

        {/* Canvas Assignments */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={16} className="text-yellow-400" /> Canvas Due Soon
          </h2>
          {summary?.canvasAssignments?.length ? (
            <div className="space-y-2">
              {summary.canvasAssignments.map(a => (
                <div key={a.id} className="p-2.5 bg-gray-800/50 rounded-lg">
                  <p className="text-sm text-gray-200 truncate">{a.title}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-gray-500">{a.courseName}</p>
                    {a.dueDate && (
                      <p className="text-xs text-yellow-400">{formatDistanceToNow(new Date(a.dueDate), { addSuffix: true })}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 text-center py-6">No Canvas assignments due</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub, accent }) {
  const accentMap = { red: 'border-red-500/20 bg-red-500/5', yellow: 'border-yellow-500/20 bg-yellow-500/5' };
  return (
    <div className={clsx('card flex items-center gap-4', accentMap[accent])}>
      <div className="p-2.5 bg-gray-800 rounded-lg">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-sm text-gray-400">{label}</p>
        <p className="text-xs text-gray-600">{sub}</p>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-64 bg-gray-800 rounded" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-24 bg-gray-800 rounded-xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-5">
        {[1,2].map(i => <div key={i} className="h-64 bg-gray-800 rounded-xl" />)}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
