const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

router.get('/', auth, async (req, res) => {
  const { start, end } = req.query;
  const where = { userId: req.user.id };
  if (start || end) {
    where.startTime = {};
    if (start) where.startTime.gte = new Date(start);
    if (end) where.startTime.lte = new Date(end);
  }
  const blocks = await prisma.timeBlock.findMany({ where, orderBy: { startTime: 'asc' } });
  res.json(blocks);
});

router.post('/', auth, async (req, res) => {
  const { title, startTime, endTime, recurring, color } = req.body;
  if (!title || !startTime || !endTime) return res.status(400).json({ error: 'Title, start and end time required' });

  const block = await prisma.timeBlock.create({
    data: {
      title,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      recurring,
      color: color || '#6366f1',
      userId: req.user.id,
    },
  });
  res.status(201).json(block);
});

router.put('/:id', auth, async (req, res) => {
  const block = await prisma.timeBlock.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!block) return res.status(404).json({ error: 'Time block not found' });

  const { title, startTime, endTime, recurring, color } = req.body;
  const updated = await prisma.timeBlock.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(startTime !== undefined && { startTime: new Date(startTime) }),
      ...(endTime !== undefined && { endTime: new Date(endTime) }),
      ...(recurring !== undefined && { recurring }),
      ...(color !== undefined && { color }),
    },
  });
  res.json(updated);
});

router.delete('/:id', auth, async (req, res) => {
  const block = await prisma.timeBlock.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!block) return res.status(404).json({ error: 'Time block not found' });
  await prisma.timeBlock.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
