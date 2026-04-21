const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { generateWeeklySchedule } = require('../services/aiScheduler');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const IMPORTANCE_LEAD_DAYS = { critical: 10, high: 7, medium: 5, low: 3 };
const MAX_SESSIONS_PER_DAY = 4;
const WORK_START = 8 * 60;       // 8:00 AM in minutes
const WORK_END   = 22 * 60 + 30; // 10:30 PM in minutes

// ── Time helpers ──────────────────────────────────────────────────────────────

function parseTime12(str) {
  if (!str) return null;
  const m = str.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === 'PM' && h !== 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

function formatTime12(minutes) {
  const h24 = Math.floor(minutes / 60);
  const min = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

function localDateStr(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

// Return all blocked time intervals (in minutes since midnight) for a given date
function getBlockedIntervalsForDay(dateStr, timeBlocks) {
  const dayDate = new Date(dateStr + 'T00:00:00');
  const dow = dayDate.getDay(); // 0=Sun ... 6=Sat
  const intervals = [];

  for (const block of timeBlocks) {
    const bs = new Date(block.startTime);
    const be = new Date(block.endTime);
    let applies = false;

    if (!block.recurring) {
      applies = localDateStr(bs) === dateStr;
    } else if (block.recurring === 'daily') {
      applies = true;
    } else if (block.recurring === 'weekdays') {
      applies = dow >= 1 && dow <= 5;
    } else if (block.recurring === 'weekly') {
      applies = bs.getDay() === dow;
    }

    if (applies) {
      intervals.push({
        start: bs.getHours() * 60 + bs.getMinutes(),
        end:   be.getHours() * 60 + be.getMinutes(),
      });
    }
  }
  return intervals;
}

// Find the first free 60-min slot that avoids both existing sessions AND time blocks
function findFreeSlot(existingSessions, blockedIntervals, durationMins = 60) {
  const occupied = [
    ...existingSessions
      .map(s => ({ start: parseTime12(s.start_time), end: parseTime12(s.end_time) }))
      .filter(o => o.start !== null && o.end !== null),
    ...blockedIntervals,
  ];

  for (let start = WORK_START; start + durationMins <= WORK_END; start += 30) {
    const end = start + durationMins;
    if (!occupied.some(o => start < o.end && end > o.start)) {
      return { start_time: formatTime12(start), end_time: formatTime12(end) };
    }
  }
  return null; // no free slot today
}

// ── Pipeline steps ────────────────────────────────────────────────────────────

// Step 1: fix AI-generated overlaps by shifting later sessions forward
// (also skips over blocked time intervals when shifting)
function resolveOverlaps(weeklySchedule, timeBlocks = []) {
  return (weeklySchedule || []).map(day => {
    const sessions = [...(day.tasks || day.sessions || [])];
    const blocked = getBlockedIntervalsForDay(day.date, timeBlocks);

    sessions.sort((a, b) => (parseTime12(a.start_time) || 0) - (parseTime12(b.start_time) || 0));

    for (let i = 0; i < sessions.length; i++) {
      const curr = sessions[i];
      const currStart = parseTime12(curr.start_time);
      const currEnd   = parseTime12(curr.end_time);
      if (currStart === null || currEnd === null) continue;
      const duration = currEnd - currStart;

      // Check against all previously placed sessions + blocked times
      const prior = sessions.slice(0, i)
        .map(s => ({ start: parseTime12(s.start_time), end: parseTime12(s.end_time) }))
        .filter(o => o.start !== null && o.end !== null);
      const occupied = [...prior, ...blocked];

      const hasConflict = (s, e) => occupied.some(o => s < o.end && e > o.start);

      if (hasConflict(currStart, currEnd)) {
        // Find the earliest gap after the last conflicting block
        let newStart = currStart;
        let attempts = 0;
        while (hasConflict(newStart, newStart + duration) && newStart + duration <= WORK_END && attempts < 48) {
          newStart += 30;
          attempts++;
        }
        if (newStart + duration <= WORK_END) {
          sessions[i] = { ...curr, start_time: formatTime12(newStart), end_time: formatTime12(newStart + duration) };
        }
      }
    }

    return { ...day, tasks: sessions };
  });
}

// Step 2a: strip assignment sessions scheduled ON or AFTER their specific due date.
// Uses keyword matching so only the matched assignment is removed, not everything.
function enforceAssignmentDates(weeklySchedule, canvasAssignments) {
  if (!canvasAssignments || !canvasAssignments.length) return weeklySchedule;

  const assignmentCutoffs = canvasAssignments
    .filter(a => a.dueDate)
    .map(a => ({
      keywords: a.title.toLowerCase().split(/[\s\-:()/!?]+/).filter(k => k.length > 2),
      cutoff: (() => { const d = new Date(a.dueDate); d.setHours(0, 0, 0, 0); return d; })(),
    }));

  return (weeklySchedule || []).map(day => {
    const dayDate = new Date(day.date + 'T00:00:00');
    dayDate.setHours(0, 0, 0, 0);

    const tasks = (day.tasks || day.sessions || []).filter(task => {
      if (task.type !== 'assignment' && task.type !== 'canvas') return true;

      // Remove session if its title keyword-matches an assignment that's already due
      const titleLower = task.title.toLowerCase();
      for (const { keywords, cutoff } of assignmentCutoffs) {
        if (dayDate >= cutoff && keywords.some(k => titleLower.includes(k))) return false;
      }

      return true;
    });

    return { ...day, tasks };
  }).filter(day => (day.tasks || []).length > 0);
}

// Step 2b: strip any test_prep sessions on or after any test's exam date
function enforceTestDates(weeklySchedule, tests) {
  if (!tests || !tests.length) return weeklySchedule;
  const testCutoffs = tests.map(t => { const d = new Date(t.date); d.setHours(0,0,0,0); return d; });
  return (weeklySchedule || []).map(day => {
    const dayDate = new Date(day.date + 'T00:00:00');
    dayDate.setHours(0, 0, 0, 0);
    const tasks = (day.tasks || day.sessions || []).filter(task =>
      task.type !== 'test_prep' || !testCutoffs.some(c => dayDate >= c)
    );
    return { ...day, tasks };
  }).filter(day => (day.tasks || []).length > 0);
}

// Step 3: guarantee exactly estimatedStudyHours prep sessions per test,
// spread evenly, each placed in the first slot free of sessions AND blocks.
function ensureStudyHours(weeklySchedule, tests, currentDate, timeBlocks = []) {
  if (!tests || !tests.length) return weeklySchedule;

  const dayMap = {};
  for (const day of (weeklySchedule || [])) {
    dayMap[day.date] = { ...day, tasks: [...(day.tasks || day.sessions || [])] };
  }

  const now = new Date(currentDate);
  now.setHours(0, 0, 0, 0);

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
        if (keywords.some(k => s.title.toLowerCase().includes(k))) existingCount++;
      }
    }

    const toAdd = neededSessions - existingCount;
    if (toAdd <= 0) continue;

    // Study window: max(today, exam - leadDays) → day before exam
    const dayBeforeExam = new Date(testCutoff);
    dayBeforeExam.setDate(dayBeforeExam.getDate() - 1);
    const idealStart = new Date(testCutoff);
    idealStart.setDate(idealStart.getDate() - Math.max(leadDays, neededSessions));
    const windowStart = idealStart < now ? now : idealStart;

    const windowDays = Math.max(1, Math.round((dayBeforeExam - windowStart) / 86400000));
    const interval = toAdd > 1 ? Math.max(1, Math.floor(windowDays / (toAdd - 1))) : 0;

    let added = 0;
    for (let i = 0; i < toAdd; i++) {
      const target = new Date(windowStart);
      target.setDate(windowStart.getDate() + i * interval);
      if (target > dayBeforeExam) break;

      const dateStr = localDateStr(target);
      if (!dayMap[dateStr]) dayMap[dateStr] = { date: dateStr, tasks: [] };
      const day = dayMap[dateStr];
      if (day.tasks.length >= MAX_SESSIONS_PER_DAY) continue;

      // Find a slot free of both existing sessions AND time blocks
      const blocked = getBlockedIntervalsForDay(dateStr, timeBlocks);
      const slot = findFreeSlot(day.tasks, blocked, 60);
      if (!slot) continue; // fully packed

      day.tasks.push({
        title: `${test.subject} — Study Session`,
        start_time: slot.start_time,
        end_time: slot.end_time,
        type: 'test_prep',
        priority: ['critical', 'high'].includes(test.importanceLevel) ? 'high' : 'medium',
      });
      added++;
    }
  }

  return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
}

// Step 4: build per-test reminder insights
function buildTestInsights(tests, currentDate) {
  if (!tests || !tests.length) return [];
  const now = new Date(currentDate);
  const urgencyEmoji = { critical: '🚨', high: '🔴', medium: '🟡', low: '🟢' };
  const urgencyLabel = { critical: 'CRITICAL', high: 'HIGH PRIORITY', medium: 'Medium priority', low: 'Low priority' };
  const advice = {
    critical: 'Start studying immediately — this is your most important exam.',
    high:     'Stay consistent — do not skip any sessions.',
    medium:   'Keep up with the sessions and review your notes.',
    low:      'Light prep scheduled — quick review sessions only.',
  };
  return tests.map(test => {
    const daysLeft = Math.ceil((new Date(test.date) - now) / 86400000);
    const sessions = Math.ceil(test.estimatedStudyHours);
    const leadDays = IMPORTANCE_LEAD_DAYS[test.importanceLevel] || 5;
    return (
      `${urgencyEmoji[test.importanceLevel] || '📚'} ${urgencyLabel[test.importanceLevel] || ''} — ` +
      `"${test.subject}" exam in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. ` +
      `${sessions} study session${sessions !== 1 ? 's' : ''} of 1h each, spread over the ${leadDays} days before your exam. ` +
      (advice[test.importanceLevel] || '')
    );
  });
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', auth, async (req, res) => {
  const schedule = await prisma.schedule.findFirst({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!schedule) return res.json(null);
  res.json({ ...schedule, weekPlan: JSON.parse(schedule.weekPlan) });
});

router.post('/generate', auth, async (req, res) => {
  try {
    const { PrismaClient } = require('@prisma/client');
    const db = new PrismaClient();

    const now = new Date();
    const monthFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const [tasks, tests, timeBlocks, canvasAssignments] = await Promise.all([
      db.task.findMany({ where: { userId: req.user.id, completed: false }, orderBy: { deadline: 'asc' } }),
      db.test.findMany({ where: { userId: req.user.id, completed: false, date: { gte: now, lte: monthFromNow } }, orderBy: { date: 'asc' } }),
      db.timeBlock.findMany({
        where: { userId: req.user.id, OR: [{ startTime: { gte: now, lte: monthFromNow } }, { recurring: { not: null } }] },
      }),
      db.canvasAssignment.findMany({ where: { userId: req.user.id, completed: false }, orderBy: { dueDate: 'asc' } }),
    ]);

    const raw = await generateWeeklySchedule({
      tasks: tasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })),
      tests, timeBlocks, canvasAssignments,
      currentDate: now.toISOString(),
    });

    const rawSchedule = raw.weekly_schedule || raw.month_plan;

    // 1. Fix AI overlaps (also shifts away from blocked times)
    const step1 = resolveOverlaps(rawSchedule, timeBlocks);
    // 2a. Remove assignment work on/after due date (covers early-morning deadlines)
    // 2b. Remove test_prep on/after exam date
    const step2b = enforceTestDates(step1, tests);
    // 3. Inject missing study sessions into free slots (avoids sessions + blocks)
    const step3 = ensureStudyHours(step2b, tests, now.toISOString(), timeBlocks);
    // 4. Final overlap pass after injection
    const step4 = resolveOverlaps(step3, timeBlocks);

    const testInsights = buildTestInsights(tests, now.toISOString());
    const weekPlan = { ...raw, weekly_schedule: step4, insights: [...testInsights, ...(raw.insights || [])] };

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const existing = await db.schedule.findFirst({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
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

router.delete('/', auth, async (req, res) => {
  await prisma.schedule.deleteMany({ where: { userId: req.user.id } });
  res.json({ success: true });
});

module.exports = router;
