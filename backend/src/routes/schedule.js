const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateWeeklySchedule } = require('../services/aiScheduler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Hard-enforce: strip any test_prep sessions scheduled on or after a test date
function enforceTestDates(weeklySchedule, tests) {
  if (!tests || !tests.length) return weeklySchedule;

  // Map each test subject (lower) -> midnight of test day
  const testDayMap = tests.map(t => ({
    keywords: t.subject.toLowerCase().split(/\s+/),
    cutoff: (() => { const d = new Date(t.date); d.setHours(0,0,0,0); return d; })(),
  }));

  const filtered = (weeklySchedule || []).map(day => {
    // Append T00:00:00 so JS parses as local time, not UTC midnight (which shifts by timezone)
    const dayDate = new Date(day.date + 'T00:00:00');
    dayDate.setHours(0, 0, 0, 0);

    const tasks = (day.tasks || day.sessions || []).filter(task => {
      if (task.type !== 'test_prep') return true;
      const titleLower = task.title.toLowerCase();
      for (const { keywords, cutoff } of testDayMap) {
        // Match if title contains any keyword from the test subject
        const matches = keywords.some(k => k.length > 2 && titleLower.includes(k));
        if (matches && dayDate >= cutoff) return false;
        // Also remove any test_prep on/after the cutoff even if no keyword match
        if (!matches && dayDate >= cutoff) return false;
      }
      return true;
    });

    return { ...day, tasks };
  }).filter(day => (day.tasks || []).length > 0);

  return filtered;
}

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
        where: {
          userId: req.user.id,
          OR: [
            { startTime: { gte: now, lte: monthFromNow } },
            { recurring: { not: null } },
          ],
        },
      }),
      db.canvasAssignment.findMany({
        where: { userId: req.user.id, completed: false },
        orderBy: { dueDate: 'asc' },
      }),
    ]);

    const raw = await generateWeeklySchedule({
      tasks: tasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })),
      tests,
      timeBlocks,
      canvasAssignments,
      currentDate: now.toISOString(),
    });

    // Hard-enforce test date constraints regardless of what the AI generated
    const weekPlan = {
      ...raw,
      weekly_schedule: enforceTestDates(raw.weekly_schedule || raw.month_plan, tests),
    };

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
