const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { syncCanvasAssignments, getCanvasCourses } = require('../services/canvasService');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Get synced Canvas assignments
router.get('/assignments', auth, async (req, res) => {
  const assignments = await prisma.canvasAssignment.findMany({
    where: {
      userId: req.user.id,
      // Exclude placeholder demo data once real Canvas is connected
      NOT: req.user.canvasToken ? { canvasId: { startsWith: 'demo-' } } : undefined,
    },
    orderBy: { dueDate: 'asc' },
  });
  res.json(assignments);
});

// Manually trigger Canvas sync
router.post('/sync', auth, async (req, res) => {
  if (!req.user.canvasToken || !req.user.canvasDomain) {
    return res.status(400).json({ error: 'Canvas token and domain not configured. Go to Settings.' });
  }
  try {
    // Delete demo placeholder assignments before importing real ones
    const deleted = await prisma.canvasAssignment.deleteMany({
      where: { userId: req.user.id, canvasId: { startsWith: 'demo-' } },
    });
    if (deleted.count > 0) {
      console.log(`[Canvas] Removed ${deleted.count} demo placeholder assignments for ${req.user.email}`);
    }

    const result = await syncCanvasAssignments(req.user);
    res.json({
      success: true,
      synced: result.synced,
      message: `Synced ${result.synced} assignments from Canvas`,
    });
  } catch (err) {
    console.error('[Canvas] Sync error:', err.message);
    res.status(500).json({ error: 'Canvas sync failed: ' + err.message });
  }
});

// Get Canvas courses
router.get('/courses', auth, async (req, res) => {
  if (!req.user.canvasToken || !req.user.canvasDomain) {
    return res.status(400).json({ error: 'Canvas not configured' });
  }
  try {
    const courses = await getCanvasCourses(req.user);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch courses: ' + err.message });
  }
});

module.exports = router;
