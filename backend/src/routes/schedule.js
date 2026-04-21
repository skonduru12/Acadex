const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateWeeklySchedule } = require('../services/aiScheduler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// How many days before the exam to START spreading study sessions (by importance)
const IMPORTANCE_LEAD_DAYS = { critical: 10, high: 7, medium: 5, low: 3 };

// How many sessions per day are allowed at maximum
const MAX_SESSIONS_PER_DAY = 4;

function localDateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Strip any test_prep sessions on or after any test's exam date
function enforceTestDates(weeklySchedule, tests) {
  if (!tests || !tests.length) return weeklySchedule;

  const testCutoffs = tests.map(t => {
    const d = new Date(t.date);
    d.setHours(0, 0, 0, 0);
    return d;
  });

  return (weeklySchedule || []).map(day => {
    const dayDate = new Date(day.date + 'T00:00:00');
    dayDate.setHours(0, 0, 0, 0);
    const tasks = (day.tasks || day.sessions || []).filter(task => {
      if (task.type !== 'test_prep') return true;
      return !testCutoffs.some(cutoff => dayDate >= cutoff);
    });
    return { ...day, tasks };
  }).filter(day => (day.tasks || []).length > 0);
}

// Guarantee exactly estimatedStudyHours prep sessions per test,
// spread evenly across the study window based on importance level.
function ensureStudyHours(weeklySchedule, tests, currentDate) {
  if (!tests || !tests.length) return weeklySchedule;

  const dayMap = {};
  for (const day of (weeklySchedule || [])) {
    dayMap[day.date] = { ...day, tasks: [...(day.tasks || day.sessions || [])] };
  }

  const now = new Date(currentDate);
  now.setHours(0, 0, 0, 0);

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
    const leadDays = IMPORTANCE_LEAD_DAYS[test.importanceLevel] || 5;

    // Count already-scheduled prep sessions for this test
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

    // Study window: from max(today, exam - leadDays) to day before exam
    const dayBeforeExam = new Date(testCutoff);
    dayBeforeExam.setDate(dayBeforeExam.getDate() - 1);

    const idealStart = new Date(testCutoff);
    idealStart.setDate(idealStart.getDate() - Math.max(leadDays, neededSessions));
    const windowStart = idealStart < now ? now : idealStart;

    const windowDays = Math.max(1, Math.round((dayBeforeExam - windowStart) / 86400000));
    // Spread sessions evenly: interval = windowDays / (toAdd - 1), min 1
    const interval = toAdd > 1 ? Math.max(1, Math.floor(windowDays / (toAdd - 1))) : 0;

    let added = 0;
    for (let i = 0; i < toAdd; i++) {
      const target = new Date(windowStart);
      target.setDate(windowStart.getDate() + i * interval);
      if (target > dayBeforeExam) break;

      const dateStr = localDateStr(target);
      if (!dayMap[dateStr]) dayMap[dateStr] = { date: dateStr, tasks: [] };
      const day = dayMap[dateStr];

      if (day.tasks.length < MAX_SESSIONS_PER_DAY) {
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
    }
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
}

// Build reminder insights for each upcoming test based on importance level
function buildTestInsights(tests, currentDate) {
  if (!tests || !tests.length) return [];
  const now = new Date(currentDate);
  const insights = [];

  const urgencyEmoji = { critical: '🚨', high: '🔴', medium: '🟡', low: '🟢' };
  const urgencyLabel = { critical: 'CRITICAL', high: 'HIGH PRIORITY', medium: 'Medium priority', low: 'Low priority' };

  for (const test of tests) {
    const examDate = new Date(test.date);
    const daysLeft = Math.ceil((examDate - now) / 86400000);
    const emoji = urgencyEmoji[test.importanceLevel] || '📚';
    const label = urgencyLabel[test.importanceLevel] || '';
    const sessions = Math.ceil(test.estimatedStudyHours);
    const leadDays = IMPORTANCE_LEAD_DAYS[test.importanceLevel] || 5;

    let reminder = `${emoji} ${label} — "${test.subject}" exam in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. `;
    reminder += `${sessions} study session${sessions !== 1 ? 's' : ''} of 1h each scheduled, `;
    reminder += `spread over the ${leadDays} days before your exam.`;

    if (test.importanceLevel === 'critical') {
      reminder += ' Start studying immediately — this is your most important exam.';
    } else if (test.importanceLevel === 'high') {
      reminder += ' Stay consistent — do not skip any sessions.';
    } else if (test.importanceLevel === 'medium') {
      reminder += ' Keep up with the sessions and review your notes.';
    } else {
      reminder += ' Light prep scheduled — quick review sessions only.';
    }

    insights.push(reminder);
  }

  return insights;
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

    // Step 1: strip test_prep on/after exam date
    const enforced = enforceTestDates(raw.weekly_schedule || raw.month_plan, tests);

    // Step 2: guarantee the exact study hours per test, spread by importance
    const weeklySchedule = ensureStudyHours(enforced, tests, now.toISOString());

    // Step 3: build per-test reminder insights
    const testInsights = buildTestInsights(tests, now.toISOString());
    const allInsights = [...testInsights, ...(raw.insights || [])];

    const weekPlan = { ...raw, weekly_schedule: weeklySchedule, insights: allInsights };

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
