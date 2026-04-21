const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const { syncCanvasAssignments } = require('./canvasService');
const { generateWeeklySchedule } = require('./aiScheduler');

const prisma = new PrismaClient();

async function syncAllUsersCanvas() {
  console.log('[Cron] Running Canvas sync for all users...');
  const users = await prisma.user.findMany({
    where: { canvasToken: { not: null }, canvasDomain: { not: null } },
  });

  for (const user of users) {
    try {
      const result = await syncCanvasAssignments(user);
      console.log(`[Cron] Synced ${result.synced} assignments for ${user.email}`);
    } catch (err) {
      console.error(`[Cron] Canvas sync failed for ${user.email}:`, err.message);
    }
  }
}

async function generateSchedulesForAllUsers() {
  console.log('[Cron] Regenerating AI schedules...');
  const users = await prisma.user.findMany();
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  for (const user of users) {
    try {
      const [tasks, tests, timeBlocks, canvasAssignments] = await Promise.all([
        prisma.task.findMany({ where: { userId: user.id, completed: false } }),
        prisma.test.findMany({ where: { userId: user.id, completed: false, date: { gte: now } } }),
        prisma.timeBlock.findMany({ where: { userId: user.id, startTime: { gte: now, lte: weekFromNow } } }),
        prisma.canvasAssignment.findMany({ where: { userId: user.id, completed: false } }),
      ]);

      if (!tasks.length && !tests.length && !canvasAssignments.length) continue;

      const weekPlan = await generateWeeklySchedule({
        tasks: tasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })),
        tests,
        timeBlocks,
        canvasAssignments,
        currentDate: now.toISOString(),
      });

      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);

      await prisma.schedule.create({
        data: { weekStart, weekPlan: JSON.stringify(weekPlan), userId: user.id },
      });

      console.log(`[Cron] Schedule generated for ${user.email}`);
    } catch (err) {
      console.error(`[Cron] Schedule gen failed for ${user.email}:`, err.message);
    }
  }
}

function startCronJobs() {
  // Sync Canvas every 10 minutes
  cron.schedule('*/10 * * * *', syncAllUsersCanvas);

  // Regenerate AI schedules every night at midnight
  cron.schedule('0 0 * * *', generateSchedulesForAllUsers);

  console.log('[Cron] Jobs scheduled: Canvas sync (10min), AI schedule (midnight)');
}

module.exports = { startCronJobs, syncAllUsersCanvas };
