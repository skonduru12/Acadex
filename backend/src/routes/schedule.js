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
    const monthFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [tasks, tests, timeBlocks, canvasAssignments] = await Promise.all([
      db.task.findMany({
        where: { userId: req.user.id, completed: false },
        orderBy: { deadline: 'asc' },
      }),
      db.test.findMany({
        where: { userId: req.user.id, completed: false, date: { gte: now, lte: monthFromNow } },
        orderBy: { date: 'asc' },
      }),
      db.timeBlock.findMany({
        where: { userId: req.user.id, startTime: { gte: now, lte: monthFromNow } },
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

    // Save schedule — upsert the latest schedule for this user
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await db.schedule.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    const saved = await db.schedule.upsert({
      where: { id: existing?.id || 'new' },
      create: {
        weekStart: monthStart,
        weekPlan: JSON.stringify(weekPlan),
        userId: req.user.id,
      },
      update: {
        weekStart: monthStart,
        weekPlan: JSON.stringify(weekPlan),
      },
    });

    res.json({ ...saved, weekPlan });
  } catch (err) {
    console.error('Schedule generation error:', err);
    res.status(500).json({ error: 'Failed to generate schedule: ' + err.message });
  }
});

// Delete schedule
router.delete('/', auth, async (req, res) => {
  await prisma.schedule.deleteMany({ where: { userId: req.user.id } });
  res.json({ success: true });
});

module.exports = router;
