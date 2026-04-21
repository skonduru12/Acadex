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

const SYSTEM_PROMPT = `You are an expert academic scheduler. Generate an optimal weekly study plan for a student.

Rules:
- Max 6 hours of productive work per day
- At least 1 break per 2 hours of work
- NEVER schedule tasks during blocked times
- Priority order: tests (highest) > canvas assignments > personal tasks
- Use spaced repetition for test prep (spread study across multiple days)
- Break work into 30–90 minute focused sessions
- Balance workload across the week
- Working hours: 8:00 AM to 10:00 PM only

Output ONLY valid JSON — no markdown fences, no explanation, just raw JSON:
{
  "week_plan": [
    {
      "date": "YYYY-MM-DD",
      "tasks": [
        {
          "title": "string",
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "type": "study|assignment|review|personal",
          "source": "canvas|personal|test_prep",
          "priority": "high|medium|low"
        }
      ]
    }
  ]
}`;

function buildUserPrompt({ tasks, tests, timeBlocks, canvasAssignments, currentDate }) {
  return `Current date/time: ${currentDate}

UPCOMING TESTS (HIGHEST PRIORITY):
${tests.length ? tests.map(t => `- ${t.subject} on ${new Date(t.date).toLocaleDateString()}, importance: ${t.importanceLevel}, needs ${t.estimatedStudyHours}h total prep`).join('\n') : 'None'}

CANVAS ASSIGNMENTS:
${canvasAssignments.length ? canvasAssignments.map(a => `- "${a.title}" (${a.courseName}), due: ${a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'No date'}`).join('\n') : 'None'}

PERSONAL TASKS:
${tasks.length ? tasks.map(t => `- "${t.title}", deadline: ${t.deadline ? new Date(t.deadline).toLocaleDateString() : 'None'}, priority: ${t.priority}, est: ${t.estimatedHours}h`).join('\n') : 'None'}

BLOCKED TIMES (NEVER schedule during these):
${timeBlocks.length ? timeBlocks.map(b => `- "${b.title}": ${new Date(b.startTime).toLocaleDateString()} ${new Date(b.startTime).toLocaleTimeString()} – ${new Date(b.endTime).toLocaleTimeString()}`).join('\n') : 'None'}

Generate a complete 7-day schedule starting today. Include every day. Return ONLY the JSON object.`;
}

// ── Groq (free cloud, LLaMA 3 70B) ──────────────────────────────────────────
async function generateWithGroq(promptData) {
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const { data } = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(promptData) },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
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
