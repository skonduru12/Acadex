import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Check, X, Filter, ExternalLink } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { clsx } from 'clsx';

const priorityColors = {
  high: 'text-red-400 bg-red-400/10 border-red-400/20',
  medium: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  low: 'text-green-400 bg-green-400/10 border-green-400/20',
};

const typeColors = {
  academic: 'text-blue-400 bg-blue-400/10',
  personal: 'text-green-400 bg-green-400/10',
  canvas: 'text-yellow-400 bg-yellow-400/10',
};

const emptyForm = { title: '', description: '', deadline: '', priority: 'medium', estimatedHours: 1, type: 'personal', tags: [] };

export default function TasksPage() {
  const [showModal, setShowModal] = useState(false);
  const [editTask, setEditTask] = useState(null);
  const [selectedCanvas, setSelectedCanvas] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState('all');
  const qc = useQueryClient();

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => {
      const params = filter === 'all' ? '' : filter === 'done' ? '?completed=true' : `?type=${filter}`;
      return api.get(`/tasks${params}`);
    },
  });

  const { data: canvasTasks = [] } = useQuery({
    queryKey: ['canvas-assignments'],
    queryFn: () => api.get('/canvas/assignments'),
  });

  const createTask = useMutation({
    mutationFn: (data) => api.post('/tasks', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); closeModal(); toast.success('Task added'); },
    onError: (err) => toast.error(err.error || 'Failed to add task'),
  });

  const updateTask = useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/tasks/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); closeModal(); toast.success('Task updated'); },
    onError: (err) => toast.error(err.error || 'Failed to update'),
  });

  const deleteTask = useMutation({
    mutationFn: (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task deleted'); },
  });

  const completeTask = useMutation({
    mutationFn: (id) => api.patch(`/tasks/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const openEdit = (task) => {
    setEditTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      deadline: task.deadline ? format(new Date(task.deadline), "yyyy-MM-dd'T'HH:mm") : '',
      priority: task.priority,
      estimatedHours: task.estimatedHours,
      type: task.type,
      tags: task.tags || [],
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditTask(null); setForm(emptyForm); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form, deadline: form.deadline || null };
    if (editTask) updateTask.mutate({ id: editTask.id, ...data });
    else createTask.mutate(data);
  };

  const filters = ['all', 'academic', 'personal', 'done'];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Tasks</h1>
        <button onClick={() => { setForm(emptyForm); setShowModal(true); }} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={14} /> Add Task
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-gray-900 rounded-lg w-fit border border-gray-800">
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={clsx('px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize',
              filter === f ? 'bg-brand-500 text-white' : 'text-gray-400 hover:text-gray-200')}>
            {f}
          </button>
        ))}
      </div>

      {/* Canvas assignments (read-only) */}
      {filter === 'all' && canvasTasks.filter(a => !a.completed).length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-yellow-400 mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" /> Canvas Assignments
          </h2>
          <div className="space-y-2">
            {canvasTasks.filter(a => !a.completed).map(a => (
              <div key={a.id} className="card flex items-center gap-3 py-3 cursor-pointer hover:border-yellow-400/30 transition-colors" onClick={() => setSelectedCanvas(a)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200 truncate">{a.title}</p>
                  <p className="text-xs text-gray-500">{a.courseName}{a.dueDate ? ` · due ${formatDistanceToNow(new Date(a.dueDate), { addSuffix: true })}` : ''}</p>
                </div>
                <span className="badge text-yellow-400 bg-yellow-400/10 border border-yellow-400/20">Canvas</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Personal tasks */}
      <div>
        {filter === 'all' && <h2 className="text-sm font-medium text-gray-400 mb-2">Personal &amp; Academic</h2>}
        {tasks.length === 0 ? (
          <div className="card text-center py-12 text-gray-500">
            <Check size={32} className="mx-auto mb-2 opacity-30" />
            <p>No tasks here. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => (
              <div key={task.id} className={clsx('card flex items-center gap-3 py-3 group transition-opacity', task.completed && 'opacity-50')}>
                <button onClick={() => completeTask.mutate(task.id)}
                  className={clsx('w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
                    task.completed ? 'bg-brand-500 border-brand-500' : 'border-gray-600 hover:border-brand-400')}>
                  {task.completed && <Check size={11} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={clsx('text-sm font-medium text-gray-200', task.completed && 'line-through text-gray-500')}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.deadline && (
                      <span className="text-xs text-gray-500">{formatDistanceToNow(new Date(task.deadline), { addSuffix: true })}</span>
                    )}
                    <span className="text-xs text-gray-600">~{task.estimatedHours}h</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={clsx('badge border', priorityColors[task.priority])}>{task.priority}</span>
                  <span className={clsx('badge', typeColors[task.type] || 'text-gray-400 bg-gray-400/10')}>{task.type}</span>
                </div>

                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEdit(task)} className="p-1.5 text-gray-500 hover:text-brand-400 hover:bg-brand-400/10 rounded-md">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => deleteTask.mutate(task.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Canvas assignment detail popup */}
      {selectedCanvas && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedCanvas(null)}>
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-white pr-4">{selectedCanvas.title}</h3>
              <button onClick={() => setSelectedCanvas(null)} className="text-gray-500 hover:text-gray-300 shrink-0"><X size={16} /></button>
            </div>
            <div className="space-y-1.5 text-sm text-gray-400">
              <p>Course: <span className="text-gray-200">{selectedCanvas.courseName}</span></p>
              {selectedCanvas.dueDate && (
                <p>Due: <span className="text-gray-200">{format(new Date(selectedCanvas.dueDate), 'MMM d, yyyy · h:mm a')}</span></p>
              )}
              {selectedCanvas.pointsPossible != null && (
                <p>Points: <span className="text-gray-200">{selectedCanvas.pointsPossible}</span></p>
              )}
              {selectedCanvas.submissionType && (
                <p>Submission: <span className="text-gray-200 capitalize">{selectedCanvas.submissionType}</span></p>
              )}
              {selectedCanvas.description && (
                <p className="text-gray-400 text-xs mt-2 leading-relaxed line-clamp-4">{selectedCanvas.description}</p>
              )}
            </div>
            {selectedCanvas.canvasUrl && (
              <a
                href={selectedCanvas.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full mt-4 text-sm flex items-center justify-center gap-2"
              >
                <ExternalLink size={14} /> Open in Canvas
              </a>
            )}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">{editTask ? 'Edit Task' : 'Add Task'}</h3>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label">Title *</label>
                <input className="input" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required placeholder="Task title" />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input resize-none h-20" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional details" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Deadline</label>
                  <input type="datetime-local" className="input" value={form.deadline} onChange={e => setForm(p => ({ ...p, deadline: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Estimated Hours</label>
                  <input type="number" className="input" min="0.25" max="24" step="0.25" value={form.estimatedHours} onChange={e => setForm(p => ({ ...p, estimatedHours: parseFloat(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select className="input" value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="personal">Personal</option>
                    <option value="academic">Academic</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <button type="button" onClick={closeModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={createTask.isPending || updateTask.isPending} className="btn-primary flex-1">
                  {editTask ? 'Save Changes' : 'Add Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
