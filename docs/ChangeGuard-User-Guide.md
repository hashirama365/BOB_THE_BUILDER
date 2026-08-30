# ChangeGuard — User Guide

ChangeGuard is a change intelligence tool that analyzes your pending tickets, maps how they relate to each other, and generates developer briefings so every engineer knows exactly what they are walking into before they start work.

---

## How ChangeGuard Works

```
Your ticket files (Markdown / PDF / DOCX)
          ↓
    changeguard run
          ↓
  ┌───────────────────────────────────┐
  │  1. Normalize tickets             │  Extract structured requirements
  │  2. Repository relevance          │  Predict likely files & modules
  │  3. Pair relationship analysis    │  Find dependencies + collisions
  │  4. Change Conflict Graph         │  Map all tickets together
  └───────────────────────────────────┘
          ↓
    changeguard report <ticket-id>
          ↓
  Developer brief (.md) + Agent context (.json)
```

ChangeGuard never modifies your codebase. It reads it.

---

## Commands

### `changeguard run`

Runs the full analysis pipeline on any new tickets in your inbox.

```bash
cd changeguard
changeguard run
```

**What it does:**
1. Scans `change-requests/inbox/` for new ticket files
2. Normalizes each ticket — extracts title, summary, requirements, acceptance criteria
3. Analyzes repository relevance — predicts which files and modules each ticket will touch
4. Runs pairwise relationship analysis between every new ticket and all existing ones
5. Rebuilds the Change Conflict Graph

**Output:**
```
.changeguard/
├── normalized/         ← clean Markdown version of each ticket
├── requests/           ← structured JSON for each ticket
├── analysis/
│   ├── tickets/        ← repository relevance per ticket
│   └── pairs/          ← relationship analysis for every ticket pair
├── change-graph.json   ← the full conflict graph
└── change-graph.md     ← human-readable Mermaid diagram
```

**Console output example:**
```
ChangeGuard

Scanning:
change-requests/inbox

5 ticket(s) found.

  CG-101       NEW
  CG-102       NEW
  ...

Normalizing tickets...
  ✓ CG-101
  ✓ CG-102

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

> [!TIP]
> ChangeGuard is incremental. Re-running `changeguard run` only processes tickets that are new or previously failed. Already-analyzed tickets are skipped.

---

### `changeguard report <ticket-id>`

Generates a concise developer briefing for a specific ticket, using the existing analysis — **no re-analysis happens**.

```bash
changeguard report CG-102
```

**What it does:**
1. Reads the existing ticket data, repository relevance, and conflict graph
2. Computes prerequisites, dependents, collisions, and unrelated tickets
3. Calls the LLM once to write a natural-language developer brief
4. Writes both a Markdown report (human) and a JSON report (agent)

**Console output:**
```
ChangeGuard Report

CG-102 — Block Billing Actions for Containers on Hold

⚠️  Dependencies + coordination required

Prerequisites:
  CG-101
  CG-105

Collisions:
  CG-105
  CG-103
  CG-101

Generating report...

Developer report:
  .changeguard/reports/CG-102.md

Agent context:
  .changeguard/reports/CG-102.json
```

> [!NOTE]
> You must run `changeguard run` at least once before using `changeguard report`. The report command reads existing artifacts — it does not run analysis itself.

---

## Report Files

### Developer Brief — `CG-102.md`

A Markdown file written like a senior engineer briefing. Sections include:

| Section | What it tells you |
|---|---|
| **Heads up** | The overall situation in 1–2 sentences |
| **Before you start** | Each prerequisite and why it matters for this ticket |
| **Suggested dependency order** | The implementation chain (e.g. CG-105 → CG-101 → CG-102) |
| **Where you'll probably be working** | Predicted files and modules to start from |
| **Watch for collisions** | Other tickets touching the same code areas |
| **Downstream impact** | Tickets that depend on your work |
| **What this means for you** | A direct practical takeaway |
| **Quick summary** | At-a-glance table |

### Agent Context — `CG-102.json`

A structured JSON file for coding agents or other tooling. Contains:

```json
{
  "schemaVersion": "1.0",
  "ticketId": "CG-102",
  "title": "Block Billing Actions for Containers on Hold",
  "status": "PREREQUISITES_AND_COORDINATION",
  "dependencyContext": {
    "directPrerequisites": ["CG-101", "CG-105"],
    "allPrerequisites": ["CG-101", "CG-105"],
    "dependencyPaths": [["CG-105", "CG-101", "CG-102"]],
    "directDependents": [],
    "allDependents": []
  },
  "repositoryRelevance": { ... },
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

4. Before picking up a ticket, generate your briefing:
   changeguard report CG-102

5. Read the report:
   open .changeguard/reports/CG-102.md

6. Start work informed.
```

---

## Supported Ticket Formats

ChangeGuard accepts ticket files in:

| Format | Extension |
|---|---|
| Markdown | `.md` |
| Plain text | `.txt` |
| PDF | `.pdf` |
| Word document | `.docx` |

Drop files directly into `change-requests/inbox/`. The filename becomes the ticket ID (e.g. `CG-102.md` → ticket `CG-102`).

---

## Tips

> [!TIP]
> **Reading the conflict graph**: Open `.changeguard/change-graph.md` in any Markdown viewer that supports Mermaid diagrams (e.g. VS Code with the Markdown Preview Mermaid Support extension, or GitHub).

> [!TIP]
> **Incremental updates**: When new tickets arrive, just drop them in the inbox and re-run `changeguard run`. Only the new tickets are processed.

> [!TIP]
> **Agent integration**: Pass `.changeguard/reports/<ticket-id>.json` to your coding agent as context before it starts implementing. It contains everything ChangeGuard knows about that ticket's relationships and risks — structured and ready to consume.

> [!CAUTION]
> **Repository relevance is predictive.** The file and module predictions in the report are starting points, not a fixed implementation plan. Always verify against the actual codebase.
