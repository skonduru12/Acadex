const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateWeeklySchedule } = require('../services/aiScheduler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Hard-enforce: strip any test_prep sessions scheduled on or after a test date
function enforceTestDates(weeklySchedule, tests) {
  if (!tests || !tests.length) return weeklySchedule;

  const testCutoffs = tests.map(t => {
    const d = new Date(t.date); d.setHours(0, 0, 0, 0); return d;
  });

  const filtered = (weeklySchedule || []).map(day => {
    // Append T00:00:00 so JS parses as local time, not UTC midnight
    const dayDate = new Date(day.date + 'T00:00:00');
    dayDate.setHours(0, 0, 0, 0);

    const tasks = (day.tasks || day.sessions || []).filter(task => {
      if (task.type !== 'test_prep') return true;
      // Remove if on/after ANY test's cutoff date
      return !testCutoffs.some(cutoff => dayDate >= cutoff);
    });

    return { ...day, tasks };
  }).filter(day => (day.tasks || []).length > 0);

  return filtered;
}

// Hard-enforce: ensure each test has exactly estimatedStudyHours sessions (1h each)
function ensureStudyHours(weeklySchedule, tests, currentDate) {
  if (!tests || !tests.length) return weeklySchedule;

  // Build mutable map: date string -> day object with tasks array
  const dayMap = {};
  for (const day of (weeklySchedule || [])) {
    dayMap[day.date] = { ...day, tasks: [...(day.tasks || day.sessions || [])] };
  }

  const now = new Date(currentDate);
  now.setHours(0, 0, 0, 0);

  // Spread study times across different hours so days with multiple sessions look natural
  const studySlots = [
    { start: '4:00 PM', end: '5:00 PM' },
    { start: '5:00 PM', end: '6:00 PM' },
    { start: '6:00 PM', end: '7:00 PM' },
    { start: '7:00 PM', end: '8:00 PM' },
  ];

  for (const test of tests) {
    const testCutoff = new Date(test.date);
    testCutoff.setHours(0, 0, 0, 0);

    const keywords = test.subject.toLowerCase().split(/\s+/).filter(k => k.length > 2);
    const neededSessions = Math.ceil(test.estimatedStudyHours);

    // Count existing prep sessions before the test cutoff
    let existingCount = 0;
    for (const [dateStr, day] of Object.entries(dayMap)) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setHours(0, 0, 0, 0);
      if (d >= testCutoff) continue;
      for (const s of day.tasks) {
        if (s.type !== 'test_prep') continue;
        const tl = s.title.toLowerCase();
        if (keywords.some(k => tl.includes(k))) existingCount++;
      }
    }

    const toAdd = neededSessions - existingCount;
    if (toAdd <= 0) continue;

    // Fill missing sessions going backwards from day before exam
    let added = 0;
    const checkDate = new Date(testCutoff);
    checkDate.setDate(checkDate.getDate() - 1);

    while (added < toAdd && checkDate >= now) {
      // toISOString gives UTC; since checkDate is local midnight (UTC+offset),
      // use toLocaleDateString to get correct local date string
      const dateStr = [
        checkDate.getFullYear(),
        String(checkDate.getMonth() + 1).padStart(2, '0'),
        String(checkDate.getDate()).padStart(2, '0'),
      ].join('-');

      if (!dayMap[dateStr]) {
        dayMap[dateStr] = { date: dateStr, tasks: [] };
      }
      const day = dayMap[dateStr];

      if (day.tasks.length < 4) {
        const slot = studySlots[added % studySlots.length];
        day.tasks.push({
          title: `${test.subject} — Study Session`,
          start_time: slot.start,
          end_time: slot.end,
          type: 'test_prep',
          priority: ['critical', 'high'].includes(test.importanceLevel) ? 'high' : 'medium',
        });
        added++;
      }

      checkDate.setDate(checkDate.getDate() - 1);
    }
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
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

    // Step 1: strip any test_prep on/after exam date
    const enforced = enforceTestDates(raw.weekly_schedule || raw.month_plan, tests);

    // Step 2: guarantee exactly estimatedStudyHours sessions per test
    const weeklySchedule = ensureStudyHours(enforced, tests, now.toISOString());

    const weekPlan = { ...raw, weekly_schedule: weeklySchedule };

    // Save — upsert the latest schedule for this user
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await db.schedule.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });

    const saved = await db.schedule.upsert({
      where: { id: existing?.id || 'new' },
      create: { weekStart: monthStart, weekPlan: JSON.stringify(weekPlan), userId: req.user.id },
      update: { weekStart: monthStart, weekPlan: JSON.stringify(weekPlan) },
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
