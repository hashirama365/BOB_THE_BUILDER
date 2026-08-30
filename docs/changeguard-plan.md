# ChangeGuard Implementation Plan

## Overview

Build ChangeGuard as a new Python project under `changeguard/` at the repo root.
ChangeGuard is a Bob-powered change intelligence workflow: it reads pending software
change tickets, analyzes where each is likely to touch the existing codebase, detects
logical dependencies and change collisions between tickets, and produces a Change
Conflict Graph — before any code is written.

Primary reference: `docs/changeguard_instructions.md`

**Demo application:** The existing container management system in `server/` and
`client/` (Express/SQLite backend + React frontend) is the "demo application" that
ChangeGuard analyzes. ChangeGuard does NOT modify it — it reads it as a reference.
The demo app path in `changeguard.yaml` will point to the repo root (or `server/`
and `client/` subpaths as needed for the relevance agent to read).

**LLM integration:** The four agents call Bob's Inference API directly via the
`openai` Python SDK using an OpenAI-compatible endpoint. The API key is read from
the `BOB_API_KEY` environment variable. The base URL and model name are read from
`changeguard.yaml` so the user only needs to set one env var.

**Ticket inbox:** `change-requests/inbox/` at the repo root (alongside `server/`
and `client/`).

**ChangeGuard state/output:** `changeguard/.changeguard/`

---

## Key Decisions

- **LLM SDK:** `openai` Python package, pointed at Bob's inference endpoint via `base_url` in config + `BOB_API_KEY` env var
- **Python packaging:** `pyproject.toml` + `pip install -e .`, entry point `changeguard run`
- **No new demo app:** The existing `server/` + `client/` codebase IS the demo application
- **Ticket inbox location:** `change-requests/inbox/` at repo root
- **Attachments location:** `change-requests/attachments/` at repo root
- **Demo tickets:** 5 tickets (CG-101 through CG-105) placed in `change-requests/inbox/` that target real parts of the container management system
- **Tests:** 5 focused unit tests, no LLM calls (pure logic only)

---

## Sub-Tasks

---

### Sub-Task 1 — Scaffold project structure and configuration

**Intent**
Create the `changeguard/` project skeleton and `change-requests/` inbox directory.
Wire up configuration loading so every subsequent component has a stable foundation.

**Expected Outcomes**
- `change-requests/inbox/` and `change-requests/attachments/` directories exist at repo root
- `changeguard/src/changeguard/` Python package tree created (all empty `__init__.py` stubs)
- `changeguard/changeguard.yaml` is written with correct paths (repo root as `repository.path`)
- `changeguard/pyproject.toml` written with dependencies and `changeguard` CLI entry point
- `changeguard/src/changeguard/config.py` loads and validates the YAML into a `Config` dataclass
- `changeguard/src/changeguard/cli.py` exposes `changeguard run` (skeleton that calls `orchestrator.run()`)

**Todo List**
1. Create `change-requests/inbox/` and `change-requests/attachments/` at repo root
2. Create full `changeguard/src/changeguard/` package with stub `__init__.py` files for:
   `ingestion/`, `repository/`, `analysis/`, `graph/`
3. Write `changeguard/changeguard.yaml`:
   ```yaml
   version: 1
   llm:
     base_url: https://YOUR_INSTANCE.bob.ibm.com/v1
     model: bob-default
   repository:
     path: ..
   change_requests:
     inbox: ../change-requests/inbox
     attachments: ../change-requests/attachments
   output:
     root: ./.changeguard
   ingestion:
     allowed_extensions: [.md, .txt, .pdf, .docx]
   analysis:
     dependency_confidence_threshold: 0.70
     collision_confidence_threshold: 0.70
   ```
4. Write `changeguard/pyproject.toml` — packaging with `openai`, `pyyaml`, `pypdf`, `python-docx`, `click` dependencies; entry point `changeguard = "changeguard.cli:main"`
5. Write `changeguard/src/changeguard/config.py` — `load_config(path) -> Config` using dataclasses
6. Write `changeguard/src/changeguard/cli.py` — `click` group with `run` command

**Relevant Context**
- `docs/changeguard_instructions.md` §3, §5, §6

**Status** — `[ ] pending`

---

### Sub-Task 2 — Data models and state management

**Intent**
Define typed data structures used throughout the pipeline and implement the
`state.json` read/write logic that drives incremental processing.

**Expected Outcomes**
- `models.py` contains dataclasses for: `TicketModel`, `RelevanceAnalysis`, `PairAnalysis`, `GraphNode`, `GraphEdge`, `ChangeGraph`
- `state.py` can load, save, query, and update ticket statuses with the 4-status lifecycle

**Todo List**
1. Write `changeguard/src/changeguard/models.py` — dataclasses matching the JSON schemas in §10, §11, §17, §21 of the spec
2. Write `changeguard/src/changeguard/state.py`:
   - `load_state(path: Path) -> dict`
   - `save_state(state: dict, path: Path)`
   - `get_ticket_status(state, ticket_id) -> str`  (absent → `"new"`)
   - `set_ticket_status(state, ticket_id, status: str)`
   - `get_complete_ticket_ids(state) -> list[str]`

**Relevant Context**
- `docs/changeguard_instructions.md` §9, §10, §11, §17, §21

**Status** — `[ ] pending`

---

### Sub-Task 3 — Ticket ingestion and normalization (Agent 1)

**Intent**
Implement raw text extraction from all supported file types and the LLM call that
produces canonical Markdown and structured JSON for each ticket.

**Expected Outcomes**
- `ingestion/extractors.py` extracts raw text from `.md`, `.txt`, `.pdf`, `.docx` via a unified `extract(path)` dispatcher
- `ingestion/normalizer.py` calls the Bob LLM to convert raw text into canonical Markdown (§10 schema) and a structured `TicketModel` JSON
- Outputs written to `.changeguard/normalized/<id>.md` and `.changeguard/requests/<id>.json`
- A malformed or unreadable ticket marks that ticket as `failed` without stopping others

**Todo List**
1. Write `changeguard/src/changeguard/ingestion/extractors.py`:
   - `extract_markdown(path) -> str`
   - `extract_text(path) -> str`
   - `extract_pdf(path) -> str`  (`pypdf`)
   - `extract_docx(path) -> str`  (`python-docx`)
   - `extract(path: Path) -> str`  — dispatches by extension
2. Write `changeguard/src/changeguard/ingestion/normalizer.py`:
   - `normalize_and_save(ticket_id, inbox_path, attachments_dir, output_root, llm_client, config)` — extracts → LLM call → writes normalized MD + requests JSON
   - LLM system prompt instructs the model to output JSON with `normalized_markdown` and `ticket_json` keys
   - Parse the JSON response and write the two output files

**Relevant Context**
- `docs/changeguard_instructions.md` §10, §29

**Status** — `[ ] pending`

---

### Sub-Task 4 — Repository relevance analysis (Agent 2)

**Intent**
Implement the Repo Relevance Analyst Agent that reads the container management system
codebase and predicts which files, modules, and symbols are relevant to a given ticket.

**Expected Outcomes**
- `repository/relevance.py` implements the agent LLM call
- Agent receives: normalized ticket MD + ticket JSON + a condensed repo file listing (paths + first N lines of key files)
- Output written to `.changeguard/analysis/tickets/<ticket-id>.json` matching the schema in §11
- Uses predictive semantics: `likelyModules`, `likelyFiles` (with confidence + reason), `relevantSymbols`

**Todo List**
1. Write `changeguard/src/changeguard/repository/relevance.py`:
   - `build_repo_context(repo_path: Path) -> str` — walks `server/src/` and `client/src/`, collects file tree + key file snippets (capped at a reasonable token budget)
   - `analyze_relevance(ticket_id, normalized_md_path, request_json_path, repo_path, attachments_dir, output_root, llm_client, config)` — assembles prompt, calls LLM, parses JSON response, writes `RelevanceAnalysis` JSON

**Relevant Context**
- `docs/changeguard_instructions.md` §11
- Container management system: `server/src/routes/bookings.ts`, `server/src/db/schema.sql`, `client/src/pages/`, `docs/architecture.md`, `docs/api-reference.md`

**Status** — `[ ] pending`

---

### Sub-Task 5 — Pair generation and relationship analysis (Agent 3)

**Intent**
Implement the unique pair generator (N choose 2, stable sorted filename naming) and
the Relationship Analyst Agent that determines logical dependency and change collision
for each pair.

**Expected Outcomes**
- `analysis/pair_generator.py` generates unique sorted pairs; for incremental runs only returns pairs not yet on disk
- `analysis/relationship.py` calls the Bob LLM with both tickets' normalized MD + relevance JSON, writes `PairAnalysis` JSON
- `logicalDependency` and `changeCollision` are independent boolean dimensions
- `independent` field derived correctly: `true` only when both dimensions are `false`

**Todo List**
1. Write `changeguard/src/changeguard/analysis/pair_generator.py`:
   - `generate_all_pairs(ticket_ids: list[str]) -> list[tuple[str, str]]` — all unique sorted pairs
   - `missing_pairs(new_ids: list[str], all_ids: list[str], pairs_dir: Path) -> list[tuple[str, str]]` — pairs with no existing JSON file
2. Write `changeguard/src/changeguard/analysis/relationship.py`:
   - `analyze_pair(ticket_a, ticket_b, normalized_dir, requests_dir, relevance_dir, output_root, llm_client, config)` — reads inputs, calls LLM, parses response, writes `PairAnalysis` JSON

**Relevant Context**
- `docs/changeguard_instructions.md` §12–17

**Status** — `[ ] pending`

---

### Sub-Task 6 — Change Conflict Graph generation (Agent 4)

**Intent**
Implement the graph builder that aggregates all pair analyses and the renderer that
produces the human-readable Markdown and machine-readable JSON outputs.

**Expected Outcomes**
- `graph/builder.py` reads all `analysis/pairs/*.json` + ticket metadata, applies confidence thresholds, returns a `ChangeGraph` object
- `graph/renderer.py` writes `change-graph.json` and `change-graph.md` (with Mermaid diagram, Logical Dependencies section, Change Collisions section, Independent Changes section)

**Todo List**
1. Write `changeguard/src/changeguard/graph/builder.py`:
   - `build_graph(pairs_dir, requests_dir, config) -> ChangeGraph` — loads all pair JSONs + ticket JSON metadata, applies thresholds, builds node/edge lists and `independentTickets`
2. Write `changeguard/src/changeguard/graph/renderer.py`:
   - `render_json(graph: ChangeGraph, output_path: Path)` — writes `change-graph.json`
   - `render_markdown(graph: ChangeGraph, output_path: Path)` — writes `change-graph.md` with Mermaid diagram

**Relevant Context**
- `docs/changeguard_instructions.md` §19–22

**Status** — `[ ] pending`

---

### Sub-Task 7 — Orchestrator and LLM client wiring

**Intent**
Wire all stages together in a deterministic orchestrator. Create the shared LLM client
helper (reads `BOB_API_KEY` env var + config) that all agents use.

**Expected Outcomes**
- `llm.py` creates and returns an `openai.OpenAI` client pointed at Bob's inference endpoint
- `orchestrator.py` drives the full pipeline: scan → normalize → relevance → pairs → graph → save state
- Completed tickets are skipped; failed tickets are retried
- Incremental: new tickets only pair against all existing complete tickets
- Console output matches the style in §23 step 4
- One failing ticket/pair marks it `failed`, prints the error, and continues

**Todo List**
1. Write `changeguard/src/changeguard/llm.py`:
   - `get_llm_client(config: Config) -> openai.OpenAI` — reads `BOB_API_KEY` from env, raises clear error if missing, returns `OpenAI(api_key=..., base_url=config.llm.base_url)`
2. Write `changeguard/src/changeguard/orchestrator.py` with `run(config)`:
   - Ensure output dirs exist
   - Scan inbox, load state
   - Identify new/failed tickets
   - For each new ticket: call `normalize_and_save` then `analyze_relevance` (sequential per ticket, natural parallel opportunity)
   - Compute `missing_pairs` for new tickets against all processed tickets
   - For each missing pair: call `analyze_pair`
   - If any work was done: call `build_graph` + `render_json` + `render_markdown`
   - Save state
   - Print console summary

**Relevant Context**
- `docs/changeguard_instructions.md` §7, §8, §18, §25, §26, §29

**Status** — `[ ] pending`

---

### Sub-Task 8 — Demo tickets

**Intent**
Create 5 realistic change-request tickets in `change-requests/inbox/` that target
real parts of the existing container management system. These are written to trigger
all four meaningful relationship combinations when analyzed by ChangeGuard.

**Expected Outcomes**
- 5 `.md` ticket files exist in `change-requests/inbox/`
- Tickets reference real files, routes, and concepts from the container management system
- Expected relationship outcomes:
  - CG-101 / CG-102: dependency=Yes, collision=Yes
  - CG-101 / CG-103: dependency=Yes, collision=No
  - CG-101 / CG-104: dependency=No, collision=No (independent)
  - CG-101 / CG-105: dependency=No, collision=Yes

**Todo List**
1. Write `change-requests/inbox/CG-101.md` — "Add container hold status" (new lifecycle status: HOLD; affects `LIFECYCLE` array in `bookings.ts` + status display in `StatusBadge.tsx`)
2. Write `change-requests/inbox/CG-102.md` — "Block billing actions for containers on hold" (depends on CG-101's HOLD status; also touches `bookings.ts` cutoff logic — collision)
3. Write `change-requests/inbox/CG-103.md` — "Emit audit events on hold status transitions" (depends on CG-101's HOLD status; targets a new `audit-log.ts` module — no collision with CG-101)
4. Write `change-requests/inbox/CG-104.md` — "Add CSV export for bookings list" (independent: new export endpoint in a new route file, touches `BookingsListPage.tsx` only for a button)
5. Write `change-requests/inbox/CG-105.md` — "Refactor booking cutoff logic into a shared policy module" (no dependency on CG-101; collision with CG-101 because both touch `bookings.ts` `checkCutoff`)

**Relevant Context**
- `docs/changeguard_instructions.md` §27
- `server/src/routes/bookings.ts` — `LIFECYCLE` array, `checkCutoff()`, advance-status logic
- `client/src/components/StatusBadge.tsx` — status display

**Status** — `[ ] pending`

---

### Sub-Task 9 — Tests

**Intent**
5 focused unit tests covering the most critical correctness guarantees. No LLM calls —
pure logic only, using in-memory fixtures.

**Expected Outcomes**
- `pytest changeguard/tests/` passes cleanly

**Todo List**
1. `changeguard/tests/test_state.py` — absent ticket → `"new"`; `complete` ticket → skipped; `failed` ticket → included for retry
2. `changeguard/tests/test_pair_generator.py` — 3 tickets yield exactly 3 unique sorted pairs; no reversed duplicate; incremental yields only new pairs
3. `changeguard/tests/test_ingestion.py` — `.md` extract returns raw text; `.txt` extract returns raw text
4. `changeguard/tests/test_relationship_model.py` — both dimensions true → `independent=false`; both false → `independent=true`
5. `changeguard/tests/test_graph_builder.py` — fixture pair JSONs produce correct node list, typed edge list, and `independentTickets`

**Relevant Context**
- `docs/changeguard_instructions.md` §28

**Status** — `[ ] pending`

---

## Implementation Notes

- Follow §31 implementation order: config → models → state → ingestion → relevance → pairs → relationship → graph → orchestrator → CLI → demo tickets → tests
- After each sub-task completes, update its status to `[x] done` before moving to the next
- The `BOB_API_KEY` env var must be set by the user before running `changeguard run`; the `base_url` and `model` are in `changeguard.yaml` and must be filled in by the user for their instance
- Never modify `server/`, `client/`, or `docs/` — those are the read-only demo application
- All LLM responses must be requested as JSON (use `response_format={"type": "json_object"}` where the model supports it, else instruct via system prompt)
