# DB Assistant

An AI-powered chatbot built into the Container Management System that lets you ask plain-English questions about your shipping data. It generates SQL, executes it safely against the local database, and returns a synthesized natural-language answer — all without ever exposing your API key to the browser.

---

## How It Works

```
User types a question
        ↓
POST /api/chat  (full conversation history)
        ↓
Server prepends DB schema system prompt
        ↓
  ┌──────────────────────────────────┐
  │  Pass 1 — LLM reasons about      │
  │  the schema and returns a SQL    │
  │  query in a ```sql ... ``` block │
  └──────────────────────────────────┘
        ↓ (if SQL found)
Server runs SELECT against SQLite
  (non-SELECT statements are rejected)
        ↓
  ┌──────────────────────────────────┐
  │  Pass 2 — LLM synthesises a      │
  │  plain-English answer from the   │
  │  query results                   │
  └──────────────────────────────────┘
        ↓
{ answer, sql?, results? }  →  Chat UI
```

---

## Features

- **Natural-language queries** — ask questions about your bookings, voyages, and containers without knowing SQL
- **Two-pass LLM flow** — first pass generates SQL; second pass synthesises a plain-English answer from the results
- **Read-only safety** — only `SELECT` statements are ever executed; any other SQL is rejected before it runs
- **Conversation history** — follow-up questions work because full message history is sent with every request
- **Results table** — if the query returns rows, a data table is rendered below the answer in the UI
- **SQL disclosure** — the query used is shown in a collapsible block so you can inspect what ran
- **Multi-provider LLM** — supports IBM Bob or Google Gemini via the same OpenAI-compatible client
- **Local fallback** — if the LLM API is unavailable, a local keyword-matching fallback handles common queries

---

## Supported Questions

| Example question | What it does |
|---|---|
| "How many bookings are there?" | `SELECT COUNT(*) FROM bookings` |
| "List all hazmat bookings" | Filters by `hazmat = 1` |
| "Which containers are currently at sea?" | Filters by `current_status` |
| "What's the next voyage from Jacksonville?" | Orders upcoming voyages by ETD |
| "How many bookings are in each status?" | `GROUP BY current_status` |
| "Who is the consignee for booking BKG-2026-0001?" | Selects consignee fields for that booking |
| "Why can't I see container MSCU1234567?" | LLM checks if it exists and explains its status |
| "List all bookings on voyage VSL-JAX-PR-0142" | Joins bookings + voyages and filters |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Database | SQLite via `better-sqlite3` |
| LLM | IBM Bob Inference API **or** Google Gemini (OpenAI-compatible) |
| HTTP client | `openai` npm package (pointed at Bob or Gemini endpoint) |

---

## Project Structure

```
server/src/
├── lib/
│   ├── bobClient.ts        # LLM client — supports Bob, Gemini, or any OpenAI-compatible API
│   ├── schemaPrompt.ts     # System prompt — full DB schema + lifecycle + safety rules
│   └── localFallback.ts    # Keyword-based fallback when LLM is unavailable
└── routes/
    └── chat.ts             # POST /api/chat — two-pass SQL execution flow

client/src/
└── pages/
    └── ChatPage.tsx        # Chat UI — message thread, results table, SQL disclosure
```

---

## Setup

### 1. Copy the example env file

```bash
cp server/.env.example server/.env
```

### 2. Configure your LLM provider

Edit `server/.env` — set **one** of the following:

**IBM Bob:**
```env
BOB_API_KEY=your_inference_api_key_here
BOB_INFERENCE_URL=https://api.us-east.bob.ibm.com/v1/chat/completions
BOB_MODEL=auto
```

**Google Gemini:**
```env
GEMINI_API_KEY=your_gemini_api_key_here
```

**Custom OpenAI-compatible endpoint:**
```env
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://your-endpoint.example.com/v1
LLM_MODEL=your-model-name
```

> The app runs fully without a key — the chatbot will fall back to local keyword matching for common queries, and all other features of the Container Management System work normally.

### 3. Start the server

```bash
npm run dev
```

The DB Assistant is available at **http://localhost:5173/chat**.

---

## API

### `POST /api/chat`

Accepts a full conversation history and returns a synthesised answer.

**Request body:**
```json
{
  "messages": [
    { "role": "user", "content": "How many bookings are there?" }
  ]
}
```

**Response:**
```json
{
  "answer": "There are 15 bookings in the system.",
  "sql": "SELECT COUNT(*) AS total FROM bookings",
  "results": [{ "total": 15 }]
}
```

| Field | Always present | Description |
|---|---|---|
| `answer` | ✅ | Plain-English synthesised answer |
| `sql` | Only if SQL was generated | The SELECT query that was executed |
| `results` | Only if SQL was executed | Array of result rows |

**Error responses:**

| Status | When |
|---|---|
| `400` | Request body malformed |
| `502` | LLM API unreachable (falls back to local handler before this) |

---

## Safety

- Only `SELECT` statements are executed — the first token of every LLM-generated query is checked before execution
- `INSERT`, `UPDATE`, `DELETE`, `DROP`, and any other non-`SELECT` statements are rejected with a safe error message
- Your API key is stored in `server/.env` and never sent to the browser
- The LLM has read access to the full DB schema in the system prompt but **no direct database connection** — the server is the only SQL executor

---

## Environment Variables

| Variable | Provider | Description |
|---|---|---|
| `BOB_API_KEY` | IBM Bob | Inference-scoped API key from the Bob portal |
| `BOB_INFERENCE_URL` | IBM Bob | Chat completions endpoint (default: `https://api.us-east.bob.ibm.com/v1/chat/completions`) |
| `BOB_MODEL` | IBM Bob | Model name (default: `auto`) |
| `GEMINI_API_KEY` | Google Gemini | API key — auto-selects `models/gemini-2.5-flash` |
| `LLM_API_KEY` | Any | Generic key — overrides provider-specific keys |
| `LLM_BASE_URL` | Any | Generic base URL for any OpenAI-compatible endpoint |
| `LLM_MODEL` | Any | Generic model name override |
