import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Plus, X, ExternalLink } from 'lucide-react';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import useThemeStore from '../store/useThemeStore';

export default function CalendarPage() {
  const themeColors = useThemeStore((s) => s.colors);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [newBlock, setNewBlock] = useState({ title: '', date: '', startTime: '', endTime: '', recurring: null, color: themeColors.colorBlock });
  const calendarRef = useRef(null);
  const qc = useQueryClient();

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString();

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events', start, end],
    queryFn: () => api.get(`/calendar/events?start=${start}&end=${end}`),
  });

  const addBlock = useMutation({
    mutationFn: (data) => api.post('/timeblocks', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setShowBlockModal(false);
      setNewBlock({ title: '', date: '', startTime: '', endTime: '', recurring: null, color: themeColors.colorBlock });
      toast.success('Time block added');
    },
    onError: (err) => toast.error(err.error || 'Failed to add block'),
  });

  const deleteBlock = useMutation({
    mutationFn: (id) => api.delete(`/timeblocks/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      setSelectedEvent(null);
      toast.success('Block removed');
    },
  });

  // Map event types to user-customizable theme colors
  const typeColorMap = {
    task:    themeColors.colorTask,
    canvas:  themeColors.colorCanvas,
    test:    themeColors.colorTest,
    block:   themeColors.colorBlock,
    google:  themeColors.colorGoogle,
    personal: themeColors.colorPersonal,
  };

  const calendarEvents = events.map(e => {
    const color = typeColorMap[e.type] || e.color;
    return {
      id: e.id,
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      backgroundColor: color,
      borderColor: color,
      extendedProps: { type: e.type, data: e.data },
    };
  });

  const handleEventClick = (info) => {
    const ev = info.event;
    setSelectedEvent({
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      allDay: ev.allDay,
      type: ev.extendedProps.type,
      data: ev.extendedProps.data,
    });
  };

  const handleSubmitBlock = (e) => {
    e.preventDefault();
    const startTime = `${newBlock.date}T${newBlock.startTime}`;
    const endTime = `${newBlock.date}T${newBlock.endTime}`;
    if (newBlock.endTime <= newBlock.startTime) {
      toast.error('End time must be after start time');
      return;
    }
    addBlock.mutate({
      title: newBlock.title,
      startTime,
      endTime,
      recurring: newBlock.recurring || null,
      color: newBlock.color,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Calendar</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {[
              { color: themeColors.colorTask,     label: 'Task' },
              { color: themeColors.colorTest,     label: 'Test' },
              { color: themeColors.colorCanvas,   label: 'Canvas' },
              { color: themeColors.colorBlock,    label: 'Block' },
              { color: themeColors.colorGoogle,   label: 'Google' },
            ].map(({ color, label }) => (
              <span key={label} className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
          <button onClick={() => setShowBlockModal(true)} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={14} /> Block Time
          </button>
        </div>
      </div>

      <div className="card p-4">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={calendarEvents}
          eventClick={handleEventClick}
          height="calc(100vh - 240px)"
          nowIndicator
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          allDaySlot
          eventMaxStack={3}
          eventMinHeight={28}
          slotDuration="00:30:00"
          eventContent={(arg) => {
            const isMonth = arg.view.type === 'dayGridMonth';
            const bg = arg.event.backgroundColor;
            return isMonth ? (
              <div className="fc-custom-month" style={{ borderLeftColor: bg }}>
                <span className="fc-custom-title">{arg.event.title}</span>
              </div>
            ) : (
              <div className="fc-custom-block" style={{ borderLeftColor: `color-mix(in srgb, ${bg} 60%, white 40%)` }}>
                {arg.timeText && <span className="fc-custom-time">{arg.timeText}</span>}
                <span className="fc-custom-title">{arg.event.title}</span>
              </div>
            );
          }}
        />
      </div>

      {/* Event detail popup */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="card w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-white">{selectedEvent.title}</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-500 hover:text-gray-300">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-1.5 text-sm text-gray-400">
              <p>Type: <span className="text-gray-200 capitalize">{selectedEvent.type === 'canvas' ? 'Canvas Assignment' : selectedEvent.type}</span></p>
              {['canvas', 'task', 'test'].includes(selectedEvent.type) && selectedEvent.start && (
                <p>Due: <span className="text-gray-200">{
                  selectedEvent.allDay
                    ? format(new Date(selectedEvent.start), 'MMM d, yyyy')
                    : format(new Date(selectedEvent.start), 'MMM d, yyyy · h:mm a')
                }</span></p>
              )}
              {selectedEvent.data?.courseName && (
                <p>Course: <span className="text-gray-200">{selectedEvent.data.courseName}</span></p>
              )}
              {['block', 'google'].includes(selectedEvent.type) && selectedEvent.start && (
                <p>Start: <span className="text-gray-200">{format(new Date(selectedEvent.start), 'MMM d · h:mm a')}</span></p>
              )}
              {['block', 'google'].includes(selectedEvent.type) && selectedEvent.end && selectedEvent.end !== selectedEvent.start && (
                <p>End: <span className="text-gray-200">{format(new Date(selectedEvent.end), 'MMM d · h:mm a')}</span></p>
              )}
            </div>
            {selectedEvent.type === 'canvas' && selectedEvent.data?.canvasUrl && (
              <a
                href={selectedEvent.data.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full mt-4 text-sm flex items-center justify-center gap-2"
              >
                <ExternalLink size={14} /> Open in Canvas
              </a>
            )}
            {selectedEvent.type === 'block' && (
              <button
                onClick={() => deleteBlock.mutate(selectedEvent.data.id)}
                className="btn-danger w-full mt-4 text-sm"
              >
                Delete Block
              </button>
            )}
          </div>
        </div>
      )}

      {/* Add time block modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowBlockModal(false)}>
          <div className="card w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-white text-lg">Block Time</h3>
                <p className="text-xs text-gray-500 mt-0.5">Mark time as unavailable for AI scheduling</p>
              </div>
              <button onClick={() => setShowBlockModal(false)} className="text-gray-500 hover:text-gray-300 p-1"><X size={18} /></button>
            </div>

            <form onSubmit={handleSubmitBlock} className="space-y-5">
              {/* Title */}
              <div>
                <label className="label">Block Title</label>
                <input className="input" value={newBlock.title} onChange={e => setNewBlock(p => ({ ...p, title: e.target.value }))} required placeholder="e.g. Gym, Class, Sleep, Dinner" />
              </div>

              {/* Date section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-800" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Date</span>
                  <div className="h-px flex-1 bg-gray-800" />
                </div>
                <div>
                  <label className="label">
                    {newBlock.recurring ? 'Starting From' : 'Date'}
                  </label>
                  <input
                    type="date"
                    className="input w-full"
                    value={newBlock.date}
                    onChange={e => setNewBlock(p => ({ ...p, date: e.target.value }))}
                    required
                  />
                  {newBlock.recurring && (
                    <p className="text-xs text-gray-500 mt-1">Recurrence begins on this date</p>
                  )}
                </div>
                {/* Recurrence */}
                <div>
                  <label className="label mb-2">Repeat</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { value: null,       label: 'Once' },
                      { value: 'daily',    label: 'Every Day' },
                      { value: 'weekdays', label: 'Weekdays' },
                      { value: 'weekly',   label: 'Weekly' },
                    ].map(opt => (
                      <button
                        key={String(opt.value)}
                        type="button"
                        onClick={() => setNewBlock(p => ({ ...p, recurring: opt.value }))}
                        className={`text-xs py-2 px-2 rounded-lg border font-medium transition-all ${
                          newBlock.recurring === opt.value
                            ? 'border-brand-500 bg-brand-500/20 text-brand-300'
                            : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {newBlock.recurring && (
                    <p className="text-xs text-gray-500 mt-1.5">
                      {newBlock.recurring === 'daily' && 'Repeats every day at the selected time'}
                      {newBlock.recurring === 'weekdays' && 'Repeats Mon–Fri at the selected time'}
                      {newBlock.recurring === 'weekly' && 'Repeats every week on the same day'}
                    </p>
                  )}
                </div>
              </div>

              {/* Time section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-800" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Time</span>
                  <div className="h-px flex-1 bg-gray-800" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start Time</label>
                    <input type="time" className="input" value={newBlock.startTime} onChange={e => setNewBlock(p => ({ ...p, startTime: e.target.value }))} required />
                  </div>
                  <div>
                    <label className="label">End Time</label>
                    <input type="time" className="input" value={newBlock.endTime} onChange={e => setNewBlock(p => ({ ...p, endTime: e.target.value }))} required />
                  </div>
                </div>
              </div>

              {/* Color section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-800" />
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Color</span>
                  <div className="h-px flex-1 bg-gray-800" />
                </div>
                <div className="flex gap-2.5">
                  {['#6366f1', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#0ea5e9', '#f97316'].map(c => (
                    <button key={c} type="button" onClick={() => setNewBlock(p => ({ ...p, color: c }))}
                      className="w-8 h-8 rounded-full border-2 transition-all hover:scale-110"
                      style={{ backgroundColor: c, borderColor: newBlock.color === c ? '#fff' : 'transparent' }} />
                  ))}
                </div>
              </div>

              <button type="submit" disabled={addBlock.isPending} className="btn-primary w-full">
                {addBlock.isPending ? 'Saving...' : newBlock.recurring ? `Save Recurring Block` : 'Save Block'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
