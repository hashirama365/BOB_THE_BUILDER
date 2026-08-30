# DB Chatbot Feature — Build Plan

## Top-Level Overview

Add a **"DB Assistant"** chat page to the existing Container Management System. The user can ask natural-language questions about their data — e.g., "How many bookings are at sea?", "Why can't I see container MSCU1234567?", "List all bookings on voyage VSL-JAX-PR-0142" — and get accurate, data-grounded answers.

**How it works:**
1. User types a question in the chat UI
2. The Express server receives the question
3. The server builds a prompt that includes the **full DB schema** + **question**, and sends it to the Bob inference API
4. Bob (the LLM) reasons about the schema, generates a SQL query, and/or answers the question directly
5. If a SQL query is produced, the server runs it against the local SQLite DB and returns the results
6. Bob synthesises the final plain-English answer from the query results
7. The answer (+ optional result table) is streamed back to the UI

**Key design decisions:**
- The LLM never has direct DB access — the server acts as the safe SQL executor
- The full schema is injected into every system prompt so the LLM always knows the data model
- Conversation history is maintained per session (in-memory on client, sent with each request) so follow-up questions work
- API key stored in `server/.env` — never sent to the client
- Model name configurable via `BOB_MODEL_NAME` env var (placeholder until confirmed)

**Stack additions:**
- Server: new `/api/chat` endpoint + Bob API client (plain `fetch`, no SDK needed)
- Client: new `ChatPage` React component + sidebar nav link
- `.env` file for secrets with `.env.example` for documentation

---

## Sub-Tasks

---

### Sub-Task 1 — Server: `.env` Setup & Bob API Client

**Intent:** Create the config layer and a reusable Bob inference client so the chat endpoint can call the LLM without duplicating auth/request logic.

**Expected Outcomes:**
- `server/.env` exists with placeholder values for `BOB_API_KEY` and `BOB_MODEL_NAME`
- `server/.env.example` committed to version control documenting all required vars
- `server/src/lib/bobClient.ts` exports a `callBob(messages)` function that POSTs to the inference endpoint and returns the response content
- The Express server loads `.env` on startup via `dotenv`
- TypeScript compiles clean

**Todo List:**
1. Install `dotenv` in `server/`
2. Create `server/.env` with:
   ```
   BOB_API_KEY=YOUR_KEY_HERE
   BOB_MODEL_NAME=YOUR_MODEL_HERE
   BOB_INFERENCE_URL=https://api.us-east.bob.ibm.com/v1/chat/completions
   ```
3. Create `server/.env.example` (same keys, no real values)
4. Add `server/.env` to `.gitignore`
5. Load dotenv at top of `server/src/index.ts`
6. Create `server/src/lib/bobClient.ts`:
   - Accepts `messages: {role: string, content: string}[]`
   - POSTs to `BOB_INFERENCE_URL` with `Authorization: Bearer BOB_API_KEY` and `model: BOB_MODEL_NAME`
   - Returns the assistant message content string
   - Throws a descriptive error on non-200 response

**Relevant Context:** Bob API: `POST https://api.us-east.bob.ibm.com/v1/chat/completions`, Inference-scoped key = no team ID header needed

**Status:** [x] done

---

### Sub-Task 2 — Server: Schema Introspection & System Prompt Builder

**Intent:** Build the system prompt that gives Bob full knowledge of the DB schema, the status lifecycle, and rules about what it can and cannot do — so every chat request is grounded in the real data model.

**Expected Outcomes:**
- `server/src/lib/schemaPrompt.ts` exports a `SYSTEM_PROMPT` string constant
- The prompt includes: all 4 table definitions (columns + types + FKs), the 10-step status lifecycle with index positions, the two routes and their port coordinates, and instructions telling the LLM to produce SQL when needed and return it in a specific fenced block format
- The prompt instructs Bob to answer in plain English, optionally provide a SQL query, never make up data, and explain when something isn't visible (e.g., container doesn't exist, wrong status filter)

**Todo List:**
1. Create `server/src/lib/schemaPrompt.ts`
2. Write the system prompt covering:
   - Role definition: "You are a DB assistant for a Container Management System..."
   - Full schema: all 4 tables with columns, types, constraints, FK relationships
   - Status lifecycle list (index 0–9 + Cancelled)
   - Both trade routes and port names
   - SQL generation instructions: when you need data, output a SQL query inside ```sql ... ``` fences
   - Safety rules: read-only queries only (SELECT), no INSERT/UPDATE/DELETE
   - Answer format: plain English summary, optionally show a results table
3. Export as a string constant `SYSTEM_PROMPT`

**Relevant Context:** Schema defined in `server/src/db/schema.sql`; status lifecycle in `server/src/routes/bookings.ts` (LIFECYCLE array)

**Status:** [x] done

---

### Sub-Task 3 — Server: `/api/chat` Endpoint

**Intent:** The core server endpoint that receives a conversation, extracts any SQL from the LLM's first response, runs it safely against SQLite, then sends results back to the LLM for a plain-English final answer.

**Expected Outcomes:**
- `POST /api/chat` accepts `{ messages: [{role, content}] }` — full conversation history
- Two-pass flow:
  1. First call to Bob with schema system prompt + conversation → may return SQL in fenced block
  2. If SQL found: execute it against SQLite (SELECT only — reject anything else), append results as a user message, second call to Bob → final plain-English answer
  3. If no SQL: first response is the final answer
- Returns `{ answer: string, sql?: string, results?: object[] }` to the client
- Rejects non-SELECT SQL with a safe error message (never executes writes from LLM output)
- Handles Bob API errors gracefully (returns 502 with explanation)

**Todo List:**
1. Create `server/src/routes/chat.ts`
2. Implement two-pass LLM flow (SQL extraction → execute → synthesise)
3. Add SQL safety check: parse first token of statement, reject if not SELECT
4. Mount `chatRouter` in `server/src/index.ts` under `/api/chat`
5. Test with a few manual questions via curl (e.g., "how many bookings are there?")

**Relevant Context:** `server/src/lib/bobClient.ts` (Sub-Task 1), `server/src/lib/schemaPrompt.ts` (Sub-Task 2), `server/src/db/database.ts` (existing DB singleton)

**Status:** [x] done

---

### Sub-Task 4 — Client: Chat Page UI

**Intent:** A full-page chat interface in the React app — clean conversation UI with message history, a text input, send button, and optional results table rendering.

**Expected Outcomes:**
- `ChatPage` component accessible at `/chat`
- Sidebar nav has a "DB Assistant" link (with a chat/bot icon)
- Messages render in a scrollable conversation thread:
  - User messages: right-aligned bubble
  - Assistant messages: left-aligned bubble, supports markdown-like formatting
  - If response includes a `results` array: render it as a mini table below the answer
  - If response includes `sql`: show it in a collapsible "SQL used" disclosure block
- Input bar at bottom: text field + Send button; Enter key submits
- Loading state: typing indicator while waiting for response
- Error state: red inline message if API call fails
- Conversation history maintained in React state and sent with each new message (so follow-ups work)
- "Clear conversation" button to reset history

**Todo List:**
1. Create `client/src/pages/ChatPage.tsx`
2. Add `/chat` route in `App.tsx`
3. Add "DB Assistant" link to `Sidebar.tsx`
4. Build message thread with user/assistant bubble styles
5. Build results table renderer (renders `results[]` as a dynamic column table)
6. Build SQL disclosure block (collapsible `<details>` element)
7. Wire send button + Enter key to `POST /api/chat` with full message history
8. Add typing/loading indicator
9. Add "Clear conversation" button
10. Test end-to-end with real questions

**Relevant Context:** Existing sidebar in `client/src/components/Sidebar.tsx`; existing routes in `client/src/App.tsx`

**Status:** [x] done

---

## Example Questions the Chatbot Should Handle

| Question | What happens |
|---|---|
| "How many bookings are there?" | SQL: `SELECT COUNT(*) FROM bookings` → "There are 15 bookings." |
| "How many bookings are on voyage VSL-JAX-PR-0142?" | SQL: join bookings + voyages → count |
| "Why can't I see container MSCU1234567?" | LLM checks if it exists, what status it's at, explains |
| "List all hazmat bookings" | SQL: `SELECT ... FROM bookings WHERE hazmat = 1` → table |
| "Which containers are currently at sea?" | SQL: filter by status "Departed Origin Port / At Sea" |
| "What's the next voyage from Jacksonville?" | SQL: voyages where origin_port = Jacksonville, ETD > now, ORDER BY ETD |
| "How many bookings are in each status?" | SQL: `GROUP BY current_status` → table |
| "Who is the consignee for booking BKG-2026-0001?" | SQL: SELECT consignee fields for that booking |

---

## Configuration Placeholders

| Env var | Value to fill in |
|---|---|
| `BOB_API_KEY` | Your Inference API key from the portal |
| `BOB_MODEL_NAME` | Model name — check portal or try `ibm-granite-3-8b-instruct` |
| `BOB_INFERENCE_URL` | `https://api.us-east.bob.ibm.com/v1/chat/completions` |
