const axios = require('axios');

/**
 * AI Scheduling Engine — uses LLaMA (free, no Anthropic cost).
 *
 * Priority order (first match wins):
 *  1. Groq cloud  — set GROQ_API_KEY in .env  (free tier: LLaMA 3 70B, 6000 req/day)
 *  2. Ollama local — set OLLAMA_URL or defaults to http://localhost:11434
 *
 * Groq free tier: https://console.groq.com  (sign up, copy key, paste in .env)
 * Ollama local:   https://ollama.com  →  `ollama pull llama3.1`
 */

const SYSTEM_PROMPT = `You are an advanced productivity planning AI. Generate a realistic optimized schedule for a student.

OBJECTIVE: Create a day-by-day schedule that maximizes productivity, minimizes stress, and ensures all deadlines are met EARLY.

CRITICAL RULES — follow strictly:
1. NEVER schedule any task during blocked times. Blocked times are sacred — zero exceptions.
2. TESTS: The test date is the EXAM DAY itself. The student is IN the exam that day — NEVER schedule ANY session on the exam date, not even before the exam time. ALL test_prep must be on days STRICTLY BEFORE the exam date.
3. STUDY HOURS: Schedule EXACTLY the total prep hours listed for each test. Split into 1-hour sessions, one per day. Example: 4h total = 4 separate days with 1 session each. Do NOT under-schedule — if 4 hours are needed, there must be 4 sessions.
4. ASSIGNMENTS: All work sessions must be completed STRICTLY BEFORE the due date — never on the due date, never after.
5. ONLY add test_prep sessions when a test exists — never add study/review sessions for no reason.
6. Break assignment tasks into 30–90 min chunks. Large tasks span multiple days.
7. Start assignments at least 2–3 days before deadline.
8. Schedule hardest tasks during peak hours (4:00 PM–8:00 PM PST). Easier tasks at other times.
9. NEVER exceed 6 hours of work per day. Max 4 sessions per day.
10. Never schedule past 10:30 PM. Working hours: 8:00 AM–10:30 PM PST only.
11. Only output days that have tasks. Skip completely empty days.
12. ALL times MUST be 12-hour PST format: "9:00 AM", "4:30 PM", "10:00 PM" — NEVER 24-hour time.
13. NEVER schedule during blocked times. Check every single session against every blocked time before including it.
14. If workload is too heavy, redistribute to earlier days and flag it in insights.

Output ONLY valid JSON, no markdown, no explanation:
{
  "weekly_schedule": [
    {
      "date": "YYYY-MM-DD",
      "tasks": [
        {
          "title": "Task name",
          "start_time": "4:00 PM",
          "end_time": "5:30 PM",
          "type": "assignment|test_prep|personal",
          "priority": "high|medium|low"
        }
      ]
    }
  ],
  "insights": [
    "Short explanation of key scheduling decisions or warnings"
  ]
}`;

function fmt12(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function expandBlocksForPrompt(blocks, startDate, endDate) {
  const lines = [];
  for (const b of blocks) {
    if (!b.recurring) {
      lines.push(`• "${b.title}": ${fmtDate(b.startTime)} ${fmt12(b.startTime)} – ${fmt12(b.endTime)}`);
      continue;
    }
    const base = new Date(b.startTime);
    const duration = new Date(b.endTime) - base;
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    while (cur <= endDate) {
      const dow = cur.getDay();
      const match =
        b.recurring === 'daily' ||
        (b.recurring === 'weekdays' && dow >= 1 && dow <= 5) ||
        (b.recurring === 'weekly' && dow === base.getDay());
      if (match) {
        const s = new Date(cur);
        s.setHours(base.getHours(), base.getMinutes(), 0, 0);
        const e = new Date(s.getTime() + duration);
        lines.push(`• "${b.title}": ${fmtDate(s)} ${fmt12(s)} – ${fmt12(e)}`);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }
  return lines.join('\n') || 'None — no blocked times';
}

function buildUserPrompt({ tasks, tests, timeBlocks, canvasAssignments, currentDate }) {
  const pstNow = new Date(currentDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const endDate = new Date(new Date(currentDate).getTime() + 14 * 24 * 60 * 60 * 1000);
  return `TODAY (PST): ${pstNow}
Plan the next 14 days. Peak productivity: 4:00 PM–8:00 PM PST. Max 6 hrs/day.

=== TESTS — schedule prep sessions ONLY on days STRICTLY BEFORE the exam date ===
${tests.length ? tests.map(t =>
  `• "${t.subject}" | EXAM DATE: ${fmtDate(t.date)} at ${fmt12(t.date)} — DO NOT schedule ANYTHING on this date | Total prep hours needed: ${t.estimatedStudyHours}h | Split into ${t.estimatedStudyHours} sessions of 1h each on separate days before exam | Importance: ${t.importanceLevel}/5`
).join('\n') : 'NONE — do NOT add any study/review/test_prep sessions at all'}

=== CANVAS ASSIGNMENTS — finish at least 1 day BEFORE due date ===
${canvasAssignments.length ? canvasAssignments.map(a =>
  `• "${a.title}" (${a.courseName}) | Due: ${a.dueDate ? fmtDate(a.dueDate) : 'No due date'}`
).join('\n') : 'None'}

=== PERSONAL TASKS ===
${tasks.length ? tasks.map(t =>
  `• "${t.title}" | Deadline: ${t.deadline ? fmtDate(t.deadline) : 'flexible'} | Priority: ${t.priority} | Est: ${t.estimatedHours || 1}h`
).join('\n') : 'None'}

=== BLOCKED TIMES — NEVER schedule anything during ANY of these ===
${expandBlocksForPrompt(timeBlocks, new Date(currentDate), endDate)}

Return ONLY the JSON. All times in 12-hour PST. Only include days that have tasks.`;
}

// ── Groq (free cloud, LLaMA 3 8B Instant) ───────────────────────────────────
async function generateWithGroq(promptData) {
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(promptData) },
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );
  return data.choices[0].message.content;
}

// ── Ollama (local, fully free) ───────────────────────────────────────────────
async function generateWithOllama(promptData) {
  const baseUrl = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'llama3.1';

  // Try OpenAI-compatible endpoint first (Ollama >= 0.1.24)
  try {
    const { data } = await axios.post(
      `${baseUrl}/v1/chat/completions`,
      {
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(promptData) },
        ],
        temperature: 0.3,
        stream: false,
      },
      { timeout: 120000 }
    );
    return data.choices[0].message.content;
  } catch {
    // Fall back to native Ollama /api/generate
    const { data } = await axios.post(
      `${baseUrl}/api/generate`,
      {
        model,
        prompt: `${SYSTEM_PROMPT}\n\n${buildUserPrompt(promptData)}`,
        stream: false,
        options: { temperature: 0.3, num_predict: 4096 },
      },
      { timeout: 120000 }
    );
    return data.response;
  }
}

// Returns true only for a real-looking Groq key (they start with "gsk_")
function isValidGroqKey(key) {
  return typeof key === 'string' && key.startsWith('gsk_') && key.length > 10;
}

function extractJSON(rawText) {
  const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('AI returned invalid schedule format. Try a larger model or retry.');
  return JSON.parse(jsonMatch[0]);
}

// ── Main export ──────────────────────────────────────────────────────────────
async function generateWeeklySchedule(promptData) {
  const groqKey = process.env.GROQ_API_KEY;
  const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1';

  // Try Groq first if a real key is configured
  if (isValidGroqKey(groqKey)) {
    console.log('[AI] Using Groq (LLaMA 3)');
    try {
      const rawText = await generateWithGroq(promptData);
      return extractJSON(rawText);
    } catch (err) {
      console.warn('[AI] Groq failed, falling back to Ollama:', err.message);
    }
  }

  // Try Ollama
  try {
    console.log(`[AI] Using Ollama (${ollamaModel}) at ${ollamaUrl}`);
    const rawText = await generateWithOllama(promptData);
    return extractJSON(rawText);
  } catch (err) {
    console.error('[AI] Ollama also failed:', err.message);
  }

  // Neither provider worked — give the user clear setup instructions
  throw new Error(
    'No AI provider is configured. To fix this:\n' +
    '  Option A (Groq — free cloud): Sign up at https://console.groq.com, copy your API key, ' +
    'and set GROQ_API_KEY=gsk_... in backend/.env\n' +
    '  Option B (Ollama — local): Install from https://ollama.com, then run: ollama pull llama3.1'
  );
}

module.exports = { generateWeeklySchedule };
