# Acadex — AI-Powered Student Productivity Hub

A full-stack web app that unifies Canvas LMS assignments, personal tasks, exam schedules, and Google Calendar into a single AI-driven planning system.

---

## Quick Start

### 1. Backend setup

```bash
cd backend
cp .env.example .env
# Edit .env — add your ANTHROPIC_API_KEY (required for AI scheduling)
# Optionally add GOOGLE_CLIENT_ID/SECRET for Google login & Calendar

npm install
npx prisma db push       # creates acadex.db
node prisma/seed.js      # loads demo data
npm run dev              # starts on :3001
```

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev              # starts on :5173
```

Open **http://localhost:5173** → click **"Continue as Demo User"** to explore immediately.

---

## Architecture

```
acadex/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # SQLite schema (User, Task, Test, TimeBlock, CanvasAssignment, Schedule)
│   │   └── seed.js            # Demo data seeder
│   └── src/
│       ├── index.js           # Express server entry
│       ├── middleware/auth.js  # JWT auth middleware
│       ├── routes/
│       │   ├── auth.js        # Google OAuth2 + demo login
│       │   ├── tasks.js       # CRUD personal/academic tasks
│       │   ├── tests.js       # CRUD exam schedule
│       │   ├── timeblocks.js  # Hard calendar blocks (gym, sleep, etc.)
│       │   ├── canvas.js      # Canvas LMS sync
│       │   ├── calendar.js    # Unified calendar events
│       │   ├── schedule.js    # AI schedule generation
│       │   └── dashboard.js   # Dashboard summary
│       └── services/
│           ├── aiScheduler.js          # Claude API scheduling engine
│           ├── canvasService.js        # Canvas LMS API client
│           ├── googleCalendarService.js # Google Calendar API
│           └── cronService.js          # Auto-sync cron jobs
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx   # Overview + today's AI schedule
        │   ├── CalendarPage.jsx # FullCalendar week/month/day views
        │   ├── TasksPage.jsx   # Tasks with Canvas + personal
        │   ├── TestsPage.jsx   # Exam schedule with urgency
        │   └── Settings.jsx    # Canvas token, Google, AI config
        ├── store/useStore.js   # Zustand auth state
        └── utils/api.js        # Axios client with JWT interceptor
```

---

## Features

### Dashboard
- Live stats: pending tasks, upcoming tests, Canvas due dates
- Today's AI-generated schedule
- Tasks due today with one-click completion
- Upcoming tests with urgency display

### Calendar
- **Week view** (default), month view, day timeline
- Color-coded event types: Tasks (blue), Tests (red), Canvas (amber), Blocks (indigo), Google (purple)
- **Block Time** — add hard constraints (gym, sleep, dinner)
- Click any event for details

### Tasks
- Filter by All / Academic / Personal / Done
- Canvas assignments shown separately (auto-synced)
- Add/edit personal tasks: title, deadline, priority, estimated hours, type
- One-click complete with strikethrough

### Tests & Exams
- Urgency timeline bars per exam
- Stats: total upcoming, total study hours needed, this week
- Importance levels: low / medium / high / critical
- Notes field for topics to cover

### AI Scheduling Engine (Claude Sonnet)
- Inputs: all tasks, tests, time blocks, Canvas assignments, current date
- Rules enforced:
  - Max 6h productive work per day
  - Break every 2 hours
  - Hard blocks are never scheduled over
  - Tests prioritized highest, then assignments, then personal
  - Spaced repetition for test prep
  - Sessions chunked into 30–90 min blocks
- Output: structured JSON weekly plan, displayed on Dashboard
- Auto-regenerates nightly via cron

### Canvas LMS Integration
- Enter your Canvas domain + API token in Settings
- Auto-syncs every **10 minutes** via cron
- All assignments appear in Tasks and Calendar
- Manual sync button available

### Google Calendar
- OAuth2 login pulls existing events into Calendar view
- AI-generated sessions can be pushed to Google Calendar

---

## API Keys & Configuration

| Variable | Required | Purpose |
|---|---|---|
| `GROQ_API_KEY` | Option A | Free LLaMA 3 70B via Groq cloud |
| `GROQ_MODEL` | Optional | Default: `llama-3.3-70b-versatile` |
| `OLLAMA_URL` | Option B | Local Ollama (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | Optional | Default: `llama3.1` |
| `GOOGLE_CLIENT_ID` | Optional | Google login + Calendar sync |
| `GOOGLE_CLIENT_SECRET` | Optional | Google login + Calendar sync |
| `JWT_SECRET` | Yes | Auth token signing (change in prod) |

**Option A — Groq (recommended, free cloud):**
Sign up at https://console.groq.com → create API key → paste as `GROQ_API_KEY`.
Free tier: 6000 requests/day, LLaMA 3 70B, very fast.

**Option B — Ollama (fully offline, zero cost):**
1. Install Ollama: https://ollama.com
2. Run `ollama pull llama3.1`
3. Leave `GROQ_API_KEY` blank — Ollama is used automatically.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Query, Zustand, FullCalendar |
| Backend | Node.js, Express, Prisma ORM |
| Database | SQLite (dev) / PostgreSQL (prod — change `DATABASE_URL`) |
| AI | Anthropic Claude Sonnet (`claude-sonnet-4-6`) |
| Auth | Google OAuth2 + JWT |
| Scheduling | node-cron (Canvas sync: 10min, AI regen: midnight) |

---

## Switching to PostgreSQL

In `backend/.env`:
```
DATABASE_URL="postgresql://user:password@localhost:5432/acadex"
```
Then `npx prisma db push`. No other changes needed.
