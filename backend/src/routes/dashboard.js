const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

router.get('/summary', auth, async (req, res) => {
  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    dueTodayTasks,
    upcomingTests,
    totalPendingTasks,
    canvasAssignments,
    todayBlocks,
    latestSchedule,
  ] = await Promise.all([
    prisma.task.findMany({
      where: { userId: req.user.id, completed: false, deadline: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.test.findMany({
      where: { userId: req.user.id, completed: false, date: { gte: now, lte: weekEnd } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    prisma.task.count({ where: { userId: req.user.id, completed: false } }),
    prisma.canvasAssignment.findMany({
      where: { userId: req.user.id, completed: false, dueDate: { gte: now, lte: weekEnd } },
      orderBy: { dueDate: 'asc' },
      take: 5,
    }),
    prisma.timeBlock.findMany({
      where: { userId: req.user.id, startTime: { gte: todayStart, lte: todayEnd } },
      orderBy: { startTime: 'asc' },
    }),
    prisma.schedule.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const todaySchedule = latestSchedule
    ? JSON.parse(latestSchedule.weekPlan).week_plan?.find(
        d => d.date === now.toISOString().split('T')[0]
      )
    : null;

  res.json({
    dueTodayTasks: dueTodayTasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })),
    upcomingTests,
    totalPendingTasks,
    canvasAssignments,
    todayBlocks,
    todaySchedule,
    stats: {
      pendingTasks: totalPendingTasks,
      upcomingTestsCount: upcomingTests.length,
      canvasDueCount: canvasAssignments.length,
    },
  });
});

module.exports = router;
