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

const SYSTEM_PROMPT = `You are an academic planner. Generate a 14-day study plan.

RULES:
- Times in 12-hour PST: "9:00 AM", "2:30 PM" — never 24-hour
- Hours 8:00 AM–10:00 PM only. Max 3 sessions/day. Skip empty days.
- NEVER schedule during blocked times.
- Tests: 1-hour daily prep starting 7 days before. Label "Study [Subject] Day N". 2-hour review the day before.
- Assignments: 1-2 sessions 2-4 days before due. Label "Work on [Title]".
- Tasks: schedule by deadline/priority.

Output ONLY this JSON (no markdown):
{"month_plan":[{"date":"YYYY-MM-DD","sessions":[{"title":"str","start_time":"9:00 AM","end_time":"10:00 AM","type":"test_prep|assignment|study|personal"}]}]}`;

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

function buildUserPrompt({ tasks, tests, timeBlocks, canvasAssignments, currentDate }) {
  const pstNow = new Date(currentDate).toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  return `Today (PST): ${pstNow}
Plan the next 14 days.

UPCOMING TESTS — schedule daily 1-hour prep sessions for each:
${tests.length ? tests.map(t =>
  `- Subject: "${t.subject}" | Test date: ${fmtDate(t.date)} | Importance: ${t.importanceLevel} | Estimated prep: ${t.estimatedStudyHours}h total`
).join('\n') : 'None'}

CANVAS ASSIGNMENTS — schedule work sessions before each due date:
${canvasAssignments.length ? canvasAssignments.map(a =>
  `- "${a.title}" (${a.courseName}) | Due: ${a.dueDate ? fmtDate(a.dueDate) : 'No due date'}`
).join('\n') : 'None'}

PERSONAL TASKS — schedule based on deadline and priority:
${tasks.length ? tasks.map(t =>
  `- "${t.title}" | Deadline: ${t.deadline ? fmtDate(t.deadline) : 'None'} | Priority: ${t.priority} | Est: ${t.estimatedHours || 1}h`
).join('\n') : 'None'}

BLOCKED TIMES — NEVER schedule sessions during these:
${timeBlocks.length ? timeBlocks.map(b =>
  `- "${b.title}": ${fmtDate(b.startTime)} ${fmt12(b.startTime)} – ${fmt12(b.endTime)}`
).join('\n') : 'None'}

Return ONLY the JSON object with month_plan. Use 12-hour PST times. Only include days that have sessions.`;
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
