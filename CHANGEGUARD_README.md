# ChangeGuard

A Bob-powered change intelligence CLI that reads your pending software tickets, maps how they relate to each other across your codebase, and generates developer briefings so every engineer knows exactly what they are walking into before they start work.

---

## What It Does

```
Your ticket files (.md / .pdf / .docx / .txt)
              ↓
      changeguard run
              ↓
  ┌─────────────────────────────────────┐
  │  1. Normalize tickets               │  Extract structured requirements
  │  2. Repository relevance analysis   │  Predict likely files & modules
  │  3. Pair relationship analysis      │  Find dependencies + collisions
  │  4. Change Conflict Graph           │  Map all tickets together
  └─────────────────────────────────────┘
              ↓
  changeguard report <ticket-id>
              ↓
  Developer brief (.md) + Agent context (.json)
```

ChangeGuard **never modifies your codebase.** It only reads it.

---

## Features

- **Ticket normalization** — ingests Markdown, PDF, Word, and plain text ticket files and extracts structured requirements
- **Repository relevance** — predicts which files and modules each ticket is likely to touch
- **Relationship analysis** — detects logical dependencies and change collisions between every pair of tickets
- **Change Conflict Graph** — produces a Mermaid diagram and JSON summary of the full relationship map
- **Developer briefings** — LLM-written, per-ticket reports that tell an engineer exactly what to do before they start work
- **Agent context** — structured JSON output ready to be fed directly to a coding agent
- **Incremental processing** — re-running only processes new or previously-failed tickets

---

## Tech Stack

| Component | Technology |
|---|---|
| Language | Python 3.9+ |
| CLI | Click |
| LLM | IBM Bob Inference API **or** Google Gemini (OpenAI-compatible) |
| Ticket formats | `.md`, `.txt`, `.pdf` (pypdf), `.docx` (python-docx) |
| Packaging | `pyproject.toml`, `pip install -e .` |

---

## Project Structure

```
changeguard/
├── changeguard.yaml              # Config — paths, model, thresholds
├── pyproject.toml                # Package definition + CLI entry point
├── src/changeguard/
│   ├── cli.py                    # `changeguard run` / `changeguard report`
│   ├── orchestrator.py           # Full pipeline driver
│   ├── config.py                 # Config loader
│   ├── models.py                 # Typed data models
│   ├── state.py                  # Incremental state tracking
│   ├── llm.py                    # LLM client factory
│   ├── ingestion/
│   │   ├── extractors.py         # Raw text extraction per file type
│   │   └── normalizer.py         # Agent 1 — ticket normalization
│   ├── repository/
│   │   └── relevance.py          # Agent 2 — repo relevance analysis
│   ├── analysis/
│   │   ├── pair_generator.py     # Unique ticket pair generator
│   │   └── relationship.py       # Agent 3 — dependency/collision analysis
│   ├── graph/
│   │   ├── builder.py            # Agent 4 — graph builder
│   │   └── renderer.py           # JSON + Mermaid Markdown output
│   └── report/
│       ├── context.py            # Report context assembly
│       ├── generator.py          # LLM-written developer brief
│       └── renderer.py           # Markdown + JSON + PDF output
└── tests/                        # 38 unit tests (no LLM calls)

change-requests/
├── inbox/                        # Drop ticket files here
└── attachments/                  # Optional attachments referenced by tickets
```

---

## Installation

### Prerequisites

- Python 3.9 or later
- pip (bundled with Python)
- An API key for IBM Bob **or** Google Gemini

### 1. Install the package

```bash
cd changeguard
pip3 install -e ".[dev]"
```

The `.[dev]` flag also installs `pytest`.

### 2. Add to PATH (one-time)

```bash
echo 'export PATH="$HOME/Library/Python/3.9/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

> Replace `3.9` with your Python version (`python3 --version` to check).

### 3. Verify

```bash
changeguard --help
```

---

## Configuration

Edit `changeguard/changeguard.yaml`:

```yaml
version: 1

llm:
  model: models/gemini-2.0-flash   # or your preferred model

repository:
  path: ..                          # path to the codebase being analyzed

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

All paths are relative to the location of `changeguard.yaml`.

---

## API Key Setup

### Option A — Google Gemini (recommended)

Create `changeguard/changeguard_gemini_key.json`:

```json
{
  "apikey": "your-gemini-api-key-here"
}
```

Or set the environment variable:

```bash
export GEMINI_API_KEY="your-gemini-api-key-here"
```

### Option B — IBM Bob

Create `changeguard/changeguard_ibm_key.json`:

```json
{
  "apikey": "your-bob-api-key-here",
  "base_url": "https://your-instance.bob.ibm.com/v1"
}
```

Or set the environment variable:

```bash
export BOB_API_KEY="your-bob-api-key-here"
```

---

## Usage

### Run the full analysis pipeline

```bash
cd changeguard
changeguard run
```

**What it does:**
1. Scans `change-requests/inbox/` for new ticket files
2. Normalizes each ticket — extracts title, summary, requirements, acceptance criteria
3. Analyzes repository relevance — predicts files and modules each ticket will touch
4. Runs pairwise relationship analysis between every new ticket and all existing ones
5. Rebuilds the Change Conflict Graph

**Console output:**
```
ChangeGuard

Scanning: change-requests/inbox

5 ticket(s) found.

  CG-101   NEW
  CG-102   NEW
  ...

Normalizing tickets...
  ✓ CG-101

Analyzing repository relevance...
  ✓ CG-101

Analyzing ticket relationships...
  ✓ CG-101 ↔ CG-102

Analysis complete.

  Logical dependencies : 3
  Change collisions    : 7
  Independent tickets  : 0

Conflict graph:
  .changeguard/change-graph.md
```

> ChangeGuard is incremental. Re-running only processes tickets that are new or previously failed.

---

### Generate a developer briefing

```bash
changeguard report CG-102
```

> You must run `changeguard run` at least once before using `changeguard report`.

Produces two files:

**`CG-102.md`** — Human-readable developer brief with sections:
- Heads up (overall situation)
- Before you start (prerequisites and why they matter)
- Suggested dependency order
- Where you'll probably be working (predicted files)
- Watch for collisions (other in-flight work touching the same code)
- Downstream impact
- Quick summary table

**`CG-102.json`** — Structured agent context:
```json
{
  "schemaVersion": "1.0",
  "ticketId": "CG-102",
  "title": "Block Billing Actions for Containers on Hold",
  "status": "PREREQUISITES_AND_COORDINATION",
  "dependencyContext": {
    "directPrerequisites": ["CG-101", "CG-105"],
    "dependencyPaths": [["CG-105", "CG-101", "CG-102"]]
  },
  "collisions": [ ... ],
  "unrelatedTickets": ["CG-104"]
}
```

---

## Report Status Values

| Status | Meaning |
|---|---|
| `✅ READY` | No prerequisites, no collisions — start immediately |
| `⏳ PREREQUISITES_PRESENT` | Some tickets must be completed first |
| `⚠️ COORDINATION_REQUIRED` | No dependencies but overlaps with other in-flight work |
| `⚠️ PREREQUISITES_AND_COORDINATION` | Both: needs prior tickets and active coordination |

---

## Typical Workflow

```
1. Drop ticket files into:
   change-requests/inbox/

2. Run analysis:
   cd changeguard
   changeguard run

3. Review the conflict graph:
   open .changeguard/change-graph.md

4. Before picking up a ticket, get your briefing:
   changeguard report CG-102

5. Read the report:
   open .changeguard/reports/CG-102.md

6. Start work informed.
```

---

## Supported Ticket Formats

| Format | Extension |
|---|---|
| Markdown | `.md` |
| Plain text | `.txt` |
| PDF | `.pdf` |
| Word document | `.docx` |

The filename becomes the ticket ID — `CG-102.md` → ticket `CG-102`.

---

## Tests

```bash
cd changeguard
python3 -m pytest tests/ -v
```

38 tests covering state management, pair generation, ingestion, relationship logic, and graph building — no LLM calls required.

---

## Quick Reference

```bash
# Install
pip3 install -e ".[dev]"

# Add to PATH (one-time, macOS)
echo 'export PATH="$HOME/Library/Python/3.9/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Run full analysis
cd changeguard && changeguard run

# Generate a ticket report
changeguard report CG-102

# Run tests
python3 -m pytest tests/ -v
```
