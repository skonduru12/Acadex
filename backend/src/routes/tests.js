const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const auth = require('../middleware/auth');

const prisma = new PrismaClient();

router.get('/', auth, async (req, res) => {
  const tests = await prisma.test.findMany({
    where: { userId: req.user.id },
    orderBy: { date: 'asc' },
  });
  res.json(tests);
});

router.post('/', auth, async (req, res) => {
  const { subject, date, importanceLevel, estimatedStudyHours, notes } = req.body;
  if (!subject || !date) return res.status(400).json({ error: 'Subject and date required' });

  const test = await prisma.test.create({
    data: {
      subject,
      date: new Date(date),
      importanceLevel: importanceLevel || 'medium',
      estimatedStudyHours: estimatedStudyHours || 3,
      notes,
      userId: req.user.id,
    },
  });
  res.status(201).json(test);
});

router.put('/:id', auth, async (req, res) => {
  const test = await prisma.test.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!test) return res.status(404).json({ error: 'Test not found' });

  const { subject, date, importanceLevel, estimatedStudyHours, notes, completed } = req.body;
  const updated = await prisma.test.update({
    where: { id: req.params.id },
    data: {
      ...(subject !== undefined && { subject }),
      ...(date !== undefined && { date: new Date(date) }),
      ...(importanceLevel !== undefined && { importanceLevel }),
      ...(estimatedStudyHours !== undefined && { estimatedStudyHours }),
      ...(notes !== undefined && { notes }),
      ...(completed !== undefined && { completed }),
    },
  });
  res.json(updated);
});

router.delete('/:id', auth, async (req, res) => {
  const test = await prisma.test.findFirst({ where: { id: req.params.id, userId: req.user.id } });
  if (!test) return res.status(404).json({ error: 'Test not found' });
  await prisma.test.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

module.exports = router;
