import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, RefreshCw, CalendarDays, Clock, ChevronRight, Trash2 } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format, parseISO, isToday, isTomorrow, isPast } from 'date-fns';

const sourceStyles = {
  test_prep: { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/25', badge: 'bg-purple-500/25 text-purple-300', label: 'Test Prep' },
  canvas:    { bg: 'bg-yellow-500/15', text: 'text-yellow-300', border: 'border-yellow-500/25', badge: 'bg-yellow-500/25 text-yellow-300', label: 'Canvas' },
  personal:  { bg: 'bg-green-500/15',  text: 'text-green-300',  border: 'border-green-500/25',  badge: 'bg-green-500/25 text-green-300',  label: 'Personal' },
  study:     { bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-blue-500/25',   badge: 'bg-blue-500/25 text-blue-300',   label: 'Study' },
  review:    { bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/25', badge: 'bg-indigo-500/25 text-indigo-300', label: 'Review' },
  assignment:{ bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/25', badge: 'bg-orange-500/25 text-orange-300', label: 'Assignment' },
};

function getStyle(session) {
  const key = session.source === 'test_prep' ? 'test_prep'
    : session.source === 'canvas' ? 'canvas'
    : session.source === 'personal' ? 'personal'
    : session.type || 'study';
  return sourceStyles[key] || sourceStyles.study;
}

function getDayLabel(dateStr) {
  try {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEEE');
  } catch { return ''; }
}

function priorityDot(priority) {
  if (priority === 'high') return <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />;
  if (priority === 'medium') return <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />;
  return <span className="w-1.5 h-1.5 rounded-full bg-gray-500 shrink-0" />;
}

export default function SchedulePage() {
  const qc = useQueryClient();

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['schedule'],
    queryFn: () => api.get('/schedule'),
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post('/schedule/generate'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      toast.success('30-day AI schedule generated!');
    },
    onError: (err) => {
      const msg = err.error || err.message || 'Failed to generate schedule';
      if (msg.includes('No AI provider')) {
        toast.error('No AI provider configured. Add a GROQ_API_KEY in backend/.env', { duration: 8000 });
      } else {
        toast.error(msg, { duration: 6000 });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete('/schedule'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule'] });
      toast.success('Schedule deleted');
    },
    onError: () => toast.error('Failed to delete schedule'),
  });

  // Support both month_plan (new) and week_plan (old) formats
  const rawPlan = schedule?.weekPlan;
  const days = (rawPlan?.month_plan || rawPlan?.week_plan || [])
    .filter(d => (d.sessions || d.tasks || []).length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Group days by month
  const byMonth = days.reduce((acc, day) => {
    const month = day.date.slice(0, 7);
    if (!acc[month]) acc[month] = [];
    acc[month].push(day);
    return acc;
  }, {});

  const totalSessions = days.reduce((n, d) => n + (d.sessions || d.tasks || []).length, 0);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <CalendarDays size={24} className="text-brand-400" />
            AI Schedule
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {totalSessions > 0
              ? `${totalSessions} sessions planned across ${days.length} days`
              : 'Generate a personalized 30-day study plan'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {days.length > 0 && (
            <button
              onClick={() => { if (confirm('Delete your entire schedule?')) deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
              className="btn-danger flex items-center gap-2"
            >
              <Trash2 size={15} />
              Delete Schedule
            </button>
          )}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="btn-primary flex items-center gap-2"
          >
            {generateMutation.isPending
              ? <RefreshCw size={15} className="animate-spin" />
              : <Sparkles size={15} />}
            {generateMutation.isPending ? 'Generating...' : 'Generate AI Schedule'}
          </button>
        </div>
      </div>

      {/* Legend */}
      {days.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(sourceStyles).map(([key, s]) => (
            <span key={key} className={`text-xs px-2.5 py-1 rounded-full ${s.badge}`}>{s.label}</span>
          ))}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw size={24} className="animate-spin text-gray-500" />
        </div>
      ) : days.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-24 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
            <CalendarDays size={32} className="text-brand-400" />
          </div>
          <div>
            <p className="text-gray-200 font-semibold text-lg">No schedule yet</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">
              Click "Generate AI Schedule" to get a smart 30-day plan based on your tests, assignments, and tasks
            </p>
          </div>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="btn-primary flex items-center gap-2 mt-2"
          >
            <Sparkles size={15} />
            Generate Now
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byMonth).map(([monthKey, monthDays]) => {
            const [year, month] = monthKey.split('-');
            const monthLabel = new Date(+year, +month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

            return (
              <div key={monthKey}>
                {/* Month header */}
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">{monthLabel}</h2>
                  <div className="flex-1 h-px bg-gray-800" />
                  <span className="text-xs text-gray-600">{monthDays.length} days</span>
                </div>

                <div className="space-y-2">
                  {monthDays.map((day) => {
                    const sessions = day.sessions || day.tasks || [];
                    let date;
                    try { date = parseISO(day.date); } catch { return null; }
                    const past = isPast(date) && !isToday(date);
                    const today = isToday(date);

                    return (
                      <div
                        key={day.date}
                        className={`card transition-opacity ${past ? 'opacity-40' : ''} ${today ? 'ring-1 ring-brand-500/40' : ''}`}
                      >
                        <div className="flex items-start gap-4">
                          {/* Date badge */}
                          <div className={`w-14 shrink-0 text-center py-1 rounded-lg ${today ? 'bg-brand-500/20' : 'bg-gray-800/60'}`}>
                            <div className={`text-xl font-bold leading-none ${today ? 'text-brand-400' : 'text-gray-200'}`}>
                              {format(date, 'd')}
                            </div>
                            <div className="text-xs text-gray-500 uppercase mt-0.5">{format(date, 'MMM')}</div>
                            <div className={`text-xs font-medium mt-0.5 ${today ? 'text-brand-400' : 'text-gray-500'}`}>
                              {getDayLabel(day.date)}
                            </div>
                          </div>

                          {/* Sessions list */}
                          <div className="flex-1 space-y-1.5 min-w-0">
                            {sessions.map((session, i) => {
                              const s = getStyle(session);
                              return (
                                <div
                                  key={i}
                                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${s.bg} ${s.border}`}
                                >
                                  {priorityDot(session.priority)}
                                  <Clock size={12} className={`${s.text} shrink-0`} />
                                  <span className={`text-xs font-medium ${s.text} shrink-0 tabular-nums`}>
                                    {session.start_time} – {session.end_time}
                                  </span>
                                  <ChevronRight size={12} className="text-gray-600 shrink-0" />
                                  <span className="text-sm text-gray-200 flex-1 truncate">{session.title}</span>
                                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${s.badge}`}>
                                    {s.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
