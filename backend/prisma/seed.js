const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@acadex.app' },
    update: {},
    create: { email: 'demo@acadex.app', name: 'Demo Student' },
  });

  const now = new Date();
  const day = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);

  // Seed tasks (only if user has none)
  const existingTasks = await prisma.task.count({ where: { userId: user.id } });
  if (existingTasks === 0) {
    const taskData = [
      { title: 'Read Chapter 5 - Organic Chemistry', type: 'academic', priority: 'high', estimatedHours: 2, deadline: day(2), userId: user.id, tags: '["academic"]' },
      { title: 'Complete Problem Set 3', type: 'academic', priority: 'high', estimatedHours: 3, deadline: day(3), userId: user.id, tags: '["academic"]' },
      { title: 'Write Lab Report', type: 'academic', priority: 'medium', estimatedHours: 4, deadline: day(5), userId: user.id, tags: '["academic"]' },
      { title: 'Call dentist for appointment', type: 'personal', priority: 'low', estimatedHours: 0.25, userId: user.id, tags: '["personal"]' },
      { title: 'Review lecture slides for Calc', type: 'academic', priority: 'medium', estimatedHours: 1.5, deadline: day(1), userId: user.id, tags: '["academic"]' },
    ];
    for (const t of taskData) await prisma.task.create({ data: t });
  }

  // Seed tests
  const existingTests = await prisma.test.count({ where: { userId: user.id } });
  if (existingTests === 0) {
    const testData = [
      { subject: 'Organic Chemistry Midterm', date: day(7), importanceLevel: 'high', estimatedStudyHours: 10, userId: user.id },
      { subject: 'Calculus II Final', date: day(14), importanceLevel: 'critical', estimatedStudyHours: 15, userId: user.id },
      { subject: 'History Quiz', date: day(4), importanceLevel: 'low', estimatedStudyHours: 2, userId: user.id },
    ];
    for (const t of testData) await prisma.test.create({ data: t });
  }

  // Seed time blocks
  const existingBlocks = await prisma.timeBlock.count({ where: { userId: user.id } });
  if (existingBlocks === 0) {
    const tomorrow = day(1); tomorrow.setHours(22, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow); tomorrowEnd.setHours(23, 59, 0, 0);
    const gymStart = day(0); gymStart.setHours(7, 0, 0, 0);
    const gymEnd = day(0); gymEnd.setHours(8, 30, 0, 0);
    await prisma.timeBlock.create({ data: { title: 'Gym', startTime: gymStart, endTime: gymEnd, color: '#10b981', userId: user.id } });
    await prisma.timeBlock.create({ data: { title: 'Sleep', startTime: tomorrow, endTime: tomorrowEnd, color: '#6366f1', userId: user.id } });
  }

  // Seed canvas assignments
  const existingCanvas = await prisma.canvasAssignment.count({ where: { userId: user.id } });
  if (existingCanvas === 0) {
    const canvasData = [
      { canvasId: 'demo-1', title: 'Homework 4 - Molecular Structures', courseName: 'Organic Chemistry 201', courseId: 'chem-201', dueDate: day(3), userId: user.id },
      { canvasId: 'demo-2', title: 'Essay: Industrial Revolution', courseName: 'History 101', courseId: 'hist-101', dueDate: day(6), userId: user.id },
      { canvasId: 'demo-3', title: 'Calculus Problem Set 7', courseName: 'Calculus II', courseId: 'calc-2', dueDate: day(2), userId: user.id },
    ];
    for (const a of canvasData) await prisma.canvasAssignment.create({ data: a });
  }

  console.log('Seed data created for demo user:', user.email);
}

main().catch(console.error).finally(() => prisma.$disconnect());
