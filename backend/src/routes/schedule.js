const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateWeeklySchedule } = require('../services/aiScheduler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get latest schedule
router.get('/', auth, async (req, res) => {
  const schedule = await prisma.schedule.findFirst({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!schedule) return res.json(null);
  res.json({ ...schedule, weekPlan: JSON.parse(schedule.weekPlan) });
});

// Generate new AI schedule
router.post('/generate', auth, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();

    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [tasks, tests, timeBlocks, canvasAssignments] = await Promise.all([
      db.task.findMany({
        where: { userId: req.user.id, completed: false },
        orderBy: { deadline: 'asc' },
      }),
      db.test.findMany({
        where: { userId: req.user.id, completed: false, date: { gte: now } },
        orderBy: { date: 'asc' },
      }),
      db.timeBlock.findMany({
        where: { userId: req.user.id, startTime: { gte: now, lte: weekFromNow } },
      }),
      db.canvasAssignment.findMany({
        where: { userId: req.user.id, completed: false },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const weekPlan = await generateWeeklySchedule({
      tasks: tasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })),
      tests,
      timeBlocks,
      canvasAssignments,
      currentDate: now.toISOString(),
    });

    // Save schedule
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const saved = await db.schedule.upsert({
      where: {
        id: (await db.schedule.findFirst({
          where: { userId: req.user.id, weekStart },
        }))?.id || 'new',
      },
      create: {
        weekStart,
        weekPlan: JSON.stringify(weekPlan),
        userId: req.user.id,
      },
      update: {
        weekPlan: JSON.stringify(weekPlan),
      },
    });

    res.json({ ...saved, weekPlan });
  } catch (err) {
    console.error('Schedule generation error:', err);
    res.status(500).json({ error: 'Failed to generate schedule: ' + err.message });
  }
});

module.exports = router;
