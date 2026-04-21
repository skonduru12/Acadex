const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getGoogleCalendarEvents, pushEventToGoogleCalendar } = require('../services/googleCalendarService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get all calendar events (tasks + tests + timeblocks + canvas + google)
router.get('/events', auth, async (req, res) => {
  const { start, end } = req.query;
  const startDate = start ? new Date(start) : new Date();
  const endDate = end ? new Date(end) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [tasks, tests, timeBlocks, canvasAssignments] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.user.id, deadline: { gte: startDate, lte: endDate } },
    }),
    prisma.test.findMany({
      where: { userId: req.user.id, date: { gte: startDate, lte: endDate } },
    }),
    prisma.timeBlock.findMany({
      where: { userId: req.user.id, startTime: { gte: startDate, lte: endDate } },
    }),
    prisma.canvasAssignment.findMany({
      where: { userId: req.user.id, dueDate: { gte: startDate, lte: endDate } },
    }),
  ]);

  const events = [
    ...tasks.map(t => ({
      id: `task-${t.id}`,
      title: t.title,
      start: t.deadline,
      end: t.deadline,
      type: 'task',
      color: t.type === 'academic' ? '#3b82f6' : '#10b981',
      allDay: true,
      data: t,
    })),
    ...tests.map(t => ({
      id: `test-${t.id}`,
      title: `TEST: ${t.subject}`,
      start: t.date,
      end: t.date,
      type: 'test',
      color: '#ef4444',
      allDay: true,
      data: t,
    })),
    ...timeBlocks.map(b => ({
      id: `block-${b.id}`,
      title: b.title,
      start: b.startTime,
      end: b.endTime,
      type: 'block',
      color: b.color,
      allDay: false,
      data: b,
    })),
    ...canvasAssignments.map(a => {
      const due = a.dueDate ? new Date(a.dueDate) : null;
      const isMidnight = due && due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0;
      const canvasUrl = a.canvasUrl ||
        (req.user.canvasDomain
          ? `https://${req.user.canvasDomain}/courses/${a.courseId}/assignments/${a.canvasId}`
          : null);
      return {
        id: `canvas-${a.id}`,
        title: a.title,
        start: due,
        end: due,
        type: 'canvas',
        color: '#f59e0b',
        allDay: isMidnight,
        dueDate: due,
        data: { ...a, canvasUrl },
      };
    }),
  ];

  // Optionally fetch Google Calendar events
  if (req.user.googleAccessToken) {
    try {
      const googleEvents = await getGoogleCalendarEvents(req.user, startDate, endDate);
      events.push(...googleEvents);
    } catch (err) {
      console.error('Google Calendar fetch error:', err.message);
    }
  }

  res.json(events);
});

// Push a schedule session to Google Calendar
router.post('/push-event', auth, async (req, res) => {
  if (!req.user.googleAccessToken) {
    return res.status(400).json({ error: 'Google Calendar not connected' });
  }
  const { title, start, end, description } = req.body;
  try {
    const event = await pushEventToGoogleCalendar(req.user, { title, start, end, description });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: 'Failed to push event: ' + err.message });
  }
});

module.exports = router;
