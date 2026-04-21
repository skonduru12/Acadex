import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, BookOpen, Clock, AlertTriangle } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import { clsx } from 'clsx';

const importanceColors = {
  low: 'text-green-400 bg-green-400/10 border-green-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  high: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  critical: 'text-red-400 bg-red-400/10 border-red-400/20',
};

const urgencyLabel = (daysLeft) => {
  if (daysLeft < 0) return { label: 'Past', color: 'text-gray-500' };
  if (daysLeft === 0) return { label: 'TODAY', color: 'text-red-400 font-bold' };
  if (daysLeft <= 2) return { label: `${daysLeft}d left`, color: 'text-red-400' };
  if (daysLeft <= 7) return { label: `${daysLeft}d left`, color: 'text-yellow-400' };
  return { label: `${daysLeft}d left`, color: 'text-green-400' };
};

const emptyForm = { subject: '', date: '', importanceLevel: 'medium', estimatedStudyHours: 3, notes: '' };

export default function TestsPage() {
  const [showModal, setShowModal] = useState(false);
  const [editTest, setEditTest] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const qc = useQueryClient();

  const { data: tests = [] } = useQuery({
    queryKey: ['tests'],
    queryFn: () => api.get('/tests'),
  });

  const createTest = useMutation({
    mutationFn: (data) => api.post('/tests', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tests'] }); closeModal(); toast.success('Test added'); },
    onError: (err) => toast.error(err.error || 'Failed'),
  });

  const updateTest = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/tests/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tests'] }); closeModal(); toast.success('Updated'); },
  });

  const deleteTest = useMutation({
    mutationFn: (id) => api.delete(`/tests/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tests'] }); toast.success('Deleted'); },
  });

  const completeTest = useMutation({
    mutationFn: (id) => api.put(`/tests/${id}`, { completed: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tests'] }),
  });

  const openEdit = (test) => {
    setEditTest(test);
    setForm({
      subject: test.subject,
      date: format(new Date(test.date), "yyyy-MM-dd'T'HH:mm"),
      importanceLevel: test.importanceLevel,
      estimatedStudyHours: test.estimatedStudyHours,
      notes: test.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditTest(null); setForm(emptyForm); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editTest) updateTest.mutate({ id: editTest.id, ...form });
    else createTest.mutate(form);
  };

  const upcoming = tests.filter(t => !t.completed && new Date(t.date) >= new Date());
  const past = tests.filter(t => t.completed || new Date(t.date) < new Date());

  const totalStudyHours = upcoming.reduce((acc, t) => acc + t.estimatedStudyHours, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tests & Exams</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> Add Test
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-red-400">{upcoming.length}</p>
          <p className="text-sm text-gray-400 mt-0.5">Upcoming Tests</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-yellow-400">{totalStudyHours}h</p>
          <p className="text-sm text-gray-400 mt-0.5">Study Hours Needed</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-brand-400">
            {upcoming.filter(t => differenceInDays(new Date(t.date), new Date()) <= 7).length}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">This Week</p>
        </div>
      </div>

      {/* Upcoming tests */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-400 mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map(test => {
              const days = differenceInDays(new Date(test.date), new Date());
              const urgency = urgencyLabel(days);
              return (
                <div key={test.id} className="card group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <BookOpen size={15} className="text-red-400 shrink-0" />
                        <h3 className="font-semibold text-white">{test.subject}</h3>
                        <span className={clsx('badge border', importanceColors[test.importanceLevel])}>
                          {test.importanceLevel}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-gray-400 flex items-center gap-1">
                          <Clock size={12} /> {format(new Date(test.date), 'EEE, MMM d')} at {format(new Date(test.date), 'h:mm a')}
                        </span>
                        <span className={urgency.color}>{urgency.label}</span>
                        <span className="text-gray-500">~{test.estimatedStudyHours}h prep</span>
                      </div>
                      {test.notes && <p className="text-xs text-gray-500 mt-1.5">{test.notes}</p>}
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => completeTest.mutate(test.id)}
                        className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-400/10 rounded-md" title="Mark done">
                        <Check size={14} />
                      </button>
                      <button onClick={() => openEdit(test)}
                        className="p-1.5 text-gray-500 hover:text-brand-400 hover:bg-brand-400/10 rounded-md">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteTest.mutate(test.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Study progress indicator */}
                  <div className="mt-3 bg-gray-800 rounded-full h-1.5">
                    <div className="bg-brand-500 rounded-full h-1.5 transition-all"
                      style={{ width: `${Math.min(100, Math.max(5, (1 - days / 30) * 100))}%` }} />
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Urgency timeline</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {upcoming.length === 0 && (
        <div className="card text-center py-14">
          <BookOpen size={40} className="mx-auto mb-3 text-gray-700" />
          <p className="text-gray-400 font-medium">No upcoming tests</p>
          <p className="text-sm text-gray-600 mt-1">Add your exams to let the AI prioritize your study schedule</p>
        </div>
      )}

      {/* Past tests */}
      {past.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-600 mb-2">Completed / Past</h2>
          <div className="space-y-2">
            {past.map(test => (
              <div key={test.id} className="card py-3 flex items-center gap-3 opacity-40 hover:opacity-60 transition-opacity">
                <Check size={15} className="text-green-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-gray-300 line-through">{test.subject}</p>
                  <p className="text-xs text-gray-600">{format(new Date(test.date), 'MMM d, yyyy')}</p>
                </div>
                <button onClick={() => deleteTest.mutate(test.id)} className="text-gray-600 hover:text-red-400 p-1">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">{editTest ? 'Edit Test' : 'Add Test / Exam'}</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Subject *</label>
                <input className="input" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} required placeholder="e.g., Organic Chemistry Midterm" />
              </div>
              <div>
                <label className="label">Date & Time *</label>
                <input type="datetime-local" className="input" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Importance</label>
                  <select className="input" value={form.importanceLevel} onChange={e => setForm(p => ({ ...p, importanceLevel: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label">Study Hours Needed</label>
                  <input type="number" className="input" min="0.5" max="100" step="0.5" value={form.estimatedStudyHours} onChange={e => setForm(p => ({ ...p, estimatedStudyHours: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none h-20" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Chapters to cover, topics, etc." />
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={createTest.isPending || updateTest.isPending} className="btn-primary flex-1">
                  {editTest ? 'Save Changes' : 'Add Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
