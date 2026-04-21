const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getCanvasClient(user) {
  return axios.create({
    baseURL: `https://${user.canvasDomain}/api/v1`,
    headers: { Authorization: `Bearer ${user.canvasToken}` },
    timeout: 15000,
  });
}

async function getCanvasCourses(user) {
  const client = getCanvasClient(user);
  const { data } = await client.get('/courses', {
    params: { enrollment_state: 'active', per_page: 100 },
  });
  return data
    .filter(c => c.name && !c.access_restricted_by_date)
    .map(c => ({ id: c.id, name: c.name, code: c.course_code }));
}

async function syncCanvasAssignments(user) {
  const client = getCanvasClient(user);

  // Fetch all active courses
  let courses = [];
  try {
    const { data } = await client.get('/courses', {
      params: { enrollment_state: 'active', per_page: 100 },
    });
    // Filter out restricted/unnamed courses
    courses = data.filter(c => c.name && c.id && !c.access_restricted_by_date);
    console.log(`[Canvas] Found ${courses.length} active courses for ${user.email}`);
  } catch (err) {
    throw new Error(`Failed to fetch courses: ${err.response?.data?.errors?.[0]?.message || err.message}`);
  }

  let synced = 0;

  for (const course of courses) {
    try {
      const { data: assignments } = await client.get(`/courses/${course.id}/assignments`, {
        params: {
          per_page: 100,
          order_by: 'due_at',
          // Only fetch assignments the student can submit
          include: ['submission'],
        },
      });

      for (const assignment of assignments) {
        // Skip if no name (malformed data)
        if (!assignment.name) continue;

        await prisma.canvasAssignment.upsert({
          where: { canvasId_userId: { canvasId: String(assignment.id), userId: user.id } },
          create: {
            canvasId: String(assignment.id),
            title: assignment.name,
            description: assignment.description
              ? assignment.description.replace(/<[^>]*>/g, '').slice(0, 500)
              : null,
            dueDate: assignment.due_at ? new Date(assignment.due_at) : null,
            courseName: course.name,
            courseId: String(course.id),
            pointsPossible: assignment.points_possible || null,
            submissionType: assignment.submission_types?.join(', ') || null,
            canvasUrl: assignment.html_url || null,
            completed: assignment.submission?.workflow_state === 'submitted' ||
                       assignment.submission?.workflow_state === 'graded',
            userId: user.id,
          },
          update: {
            title: assignment.name,
            description: assignment.description
              ? assignment.description.replace(/<[^>]*>/g, '').slice(0, 500)
              : null,
            dueDate: assignment.due_at ? new Date(assignment.due_at) : null,
            courseName: course.name,
            pointsPossible: assignment.points_possible || null,
            canvasUrl: assignment.html_url || null,
            completed: assignment.submission?.workflow_state === 'submitted' ||
                       assignment.submission?.workflow_state === 'graded',
            syncedAt: new Date(),
          },
        });
        synced++;
      }
    } catch (err) {
      console.error(`[Canvas] Error syncing course "${course.name}" (${course.id}):`, err.message);
    }
  }

  console.log(`[Canvas] Sync complete — ${synced} assignments for ${user.email}`);
  return { synced, courses: courses.length };
}

module.exports = { syncCanvasAssignments, getCanvasCourses };
