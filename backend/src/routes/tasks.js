const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

// Get all tasks
router.get('/', auth, async (req, res) => {
  const { type, completed } = req.query;
  const where = { userId: req.user.id };
  if (type) where.type = type;
  if (completed !== undefined) where.completed = completed === 'true';

  const tasks = await prisma.task.findMany({
    where,
    orderBy: [{ deadline: 'asc' }, { priority: 'desc' }],
  });
  res.json(tasks.map(t => ({ ...t, tags: JSON.parse(t.tags) })));
});

// Create task
router.post('/', auth, async (req, res) => {
  const { title, description, deadline, priority, estimatedHours, type, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });

  const task = await prisma.task.create({
    data: {
      title,
      description,
      deadline: deadline ? new Date(deadline) : null,
      priority: priority || 'medium',
      estimatedHours: estimatedHours || 1,
      type: type || 'personal',
      tags: JSON.stringify(tags || []),
      userId: req.user.id,
    },
  });
  res.status(201).json({ ...task, tags: JSON.parse(task.tags) });
});

// Update task
router.put('/:id', auth, async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, description, deadline, priority, estimatedHours, type, tags, completed } = req.body;
  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
      ...(priority !== undefined && { priority }),
      ...(estimatedHours !== undefined && { estimatedHours }),
      ...(type !== undefined && { type }),
      ...(tags !== undefined && { tags: JSON.stringify(tags) }),
      ...(completed !== undefined && { completed }),
    },
  });
  res.json({ ...updated, tags: JSON.parse(updated.tags) });
});

// Delete task
router.delete('/:id', auth, async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  await prisma.task.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// Toggle complete
router.patch('/:id/complete', auth, async (req, res) => {
  const task = await prisma.task.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const updated = await prisma.task.update({
    where: { id: req.params.id },
    data: { completed: !task.completed },
  });
  res.json({ ...updated, tags: JSON.parse(updated.tags) });
});

module.exports = router;
