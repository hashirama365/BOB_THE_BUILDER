# ChangeGuard — Ticket Report Generator Implementation Instructions

## 1. Goal

Implement a new ChangeGuard module that generates a concise, developer-friendly report for a selected ticket.

The existing ChangeGuard pipeline already produces:

- normalized tickets;
- repository relevance analysis;
- pairwise relationship analysis;
- the Change Conflict Graph.

The new module must **reuse those existing artifacts**.

It must not redo repository analysis or relationship detection.

The purpose of the report is:

> Explain what the existing ChangeGuard analysis means for the developer or coding agent about to work on one specific ticket.

The report should feel like a short technical briefing from an experienced engineer, not a raw dump of graph data.

---

# 2. User Experience

The user runs:

```bash
changeguard report CG-102
```

ChangeGuard generates:

```text
.changeguard/reports/
├── CG-102.md
└── CG-102.json
```

The Markdown file is intended for a human developer.

The JSON file is intended for another agent or program.

Generate both from the same underlying ticket context.

Do not require separate commands for human and agent output.

---

# 3. Existing Inputs

For a selected ticket such as:

```text
CG-102
```

reuse existing ChangeGuard artifacts.

Read:

```text
.changeguard/requests/CG-102.json
```

Read:

```text
.changeguard/analysis/tickets/CG-102.json
```

Read:

```text
.changeguard/change-graph.json
```

Read relevant pair files from:

```text
.changeguard/analysis/pairs/
```

Examples:

```text
CG-101__CG-102.json
CG-102__CG-103.json
CG-102__CG-105.json
```

The module may also read normalized ticket Markdown where useful:

```text
.changeguard/normalized/CG-102.md
```

Do not perform new repository-wide analysis unless required input artifacts are missing.

---

# 4. Architecture

Implement the reporting feature as two simple responsibilities.

```text
changeguard report CG-102
          │
          ▼
┌─────────────────────────┐
│ Report Context Builder  │
│ deterministic code      │
└────────────┬────────────┘
             │
             ▼
      TicketReportContext
             │
             ▼
┌─────────────────────────┐
│ Change Report Generator │
│ Bob / report logic      │
└────────────┬────────────┘
             │
      ┌──────┴──────┐
      ▼             ▼
 CG-102.md      CG-102.json
 Developer       Agent
 Brief           Context
```

The Context Builder should perform deterministic graph traversal and artifact aggregation.

The report-generation layer should turn that context into concise, useful language.

Do not make the LLM rediscover graph relationships that are already stored.

---

# 5. Report Context Builder

Create a structured internal model for the selected ticket.

Suggested fields:

```json
{
  "ticketId": "CG-102",
  "title": "Block Billing Actions for Containers on Hold",

  "requirements": [],

  "repositoryRelevance": {
    "likelyModules": [],
    "likelyFiles": [],
    "relevantSymbols": []
  },

  "dependencies": {
    "directPrerequisites": [],
    "allPrerequisites": [],
    "dependencyPaths": [],
    "directDependents": [],
    "allDependents": []
  },

  "collisions": [],

  "unrelatedTickets": [],

  "status": ""
}
```

Keep this structure small.

Do not add fields unless they provide clear value to the report.

---

# 6. Dependency Traversal

The Change Conflict Graph stores dependency edges as:

```text
PREREQUISITE → DEPENDENT
```

For the selected ticket, calculate:

## Direct prerequisites

Tickets with an edge directly into the selected ticket.

Example:

```text
CG-101 → CG-102
CG-105 → CG-102
```

Then:

```text
directPrerequisites:
CG-101
CG-105
```

## Transitive prerequisites

Follow dependency edges upstream.

Example:

```text
CG-105 → CG-101 → CG-102
```

Then CG-105 is also part of the prerequisite chain.

Store useful dependency paths such as:

```text
CG-105 → CG-101 → CG-102
```

## Direct dependents

Tickets that directly depend on the selected ticket.

Example:

```text
CG-102 → CG-106
```

Then CG-106 is a direct dependent.

## Transitive dependents

Follow downstream dependency relationships.

This allows the report to tell a developer:

> Other pending tickets depend on this work, so avoid casually changing the contract they may rely on.

Implement traversal deterministically.

Do not ask the reporting agent to infer graph paths from prose.

---

# 7. Collision Context

Find every pair analysis involving the selected ticket where:

```text
changeCollision.exists == true
```

For each collision collect:

```text
ticket ID
ticket title
confidence
shared files
shared modules
evidence
```

Example:

```json
{
  "ticketId": "CG-105",
  "title": "Refactor Booking Cutoff Logic into a Shared Policy Module",
  "confidence": 1.0,
  "sharedFiles": [
    "src/policy/BookingCutoffPolicy.ts"
  ],
  "sharedModules": [
    "src/policy"
  ],
  "evidence": [
    "Both tickets interact with shared booking eligibility policy."
  ]
}
```

Do not make confidence score the primary explanation.

Evidence and practical relevance matter more.

---

# 8. Unrelated Tickets

For the selected ticket, identify pending tickets with:

```text
no logical dependency
AND
no collision
```

These can be summarized as unrelated or low concern.

Do not devote large sections of the report to them.

Example:

> CG-104 appears unrelated to this work, so you probably do not need to coordinate with it.

---

# 9. Report Status

Derive a simple high-level status.

Use only:

```text
READY
PREREQUISITES_PRESENT
COORDINATION_REQUIRED
PREREQUISITES_AND_COORDINATION
```

Rules:

```text
no prerequisites
+
no collisions
=
READY
```

```text
prerequisites
+
no collisions
=
PREREQUISITES_PRESENT
```

```text
no prerequisites
+
collisions
=
COORDINATION_REQUIRED
```

```text
prerequisites
+
collisions
=
PREREQUISITES_AND_COORDINATION
```

Do not label a ticket as `BLOCKED`.

ChangeGuard does not know the team's actual implementation status.

---

# 10. Human Report Philosophy

The Markdown report must not feel like a database dump.

It should feel like:

> A senior developer giving another developer a 60-second briefing before they pick up the ticket.

Use concise, natural language.

Good headings:

```text
Heads up
Before you start
Where you'll probably be working
Watch for collisions
What this means for you
Quick summary
```

Avoid overly mechanical headings such as:

```text
TRANSITIVE DEPENDENCY ANALYSIS
PAIRWISE COLLISION RESULTS
REPOSITORY IMPACT DATA
```

The report should explain relationships, not merely repeat them.

---

# 11. Desired Report Structure

Generate approximately the following structure.

```markdown
# ChangeGuard Brief — CG-102

## Block Billing Actions for Containers on Hold

**Status:** ⚠ Dependencies + coordination required

### Heads up

One or two sentences explaining the overall situation.

Example:

This change is not isolated. It depends on work from CG-101 and CG-105 and overlaps with several tickets touching container hold and booking-policy behavior.

### Before you start

Explain direct and important transitive prerequisites.

Example:

**CG-101 — Add Container Hold Status**

CG-102 relies on the hold-state behavior introduced by this ticket. Verify that contract before implementing billing restrictions.

**CG-105 — Refactor Booking Cutoff Logic**

This ticket introduces shared policy behavior that also affects CG-102. Reuse the shared policy instead of recreating similar eligibility logic.

### Suggested dependency order

CG-105
   ↓
CG-101
   ↓
CG-102

Only include this when useful.

### Where you'll probably be working

Summarize the strongest repository relevance.

Example:

ChangeGuard found the strongest relevance around:

- Billing authorization
- Container hold-state handling
- Shared booking policy logic

Likely files:

- `src/billing/BillingService.ts`
- `src/container/ContainerStatus.ts`
- `src/policy/BookingCutoffPolicy.ts`

> Tip: Treat these as starting points, not a fixed implementation plan. Verify the current code before making changes.

### Watch for collisions

For each important collision:

**CG-105 — Shared policy logic · 100% confidence**

Both tickets are expected to interact with the shared booking policy area. This is the strongest coordination risk detected.

> Tip: Check whether CG-105 has already moved the relevant behavior into `BookingCutoffPolicy` before adding new billing checks.

Do not include repetitive boilerplate for every collision.

Prefer the highest-value explanation.

### Downstream impact

If other tickets depend on this one, explain briefly.

Example:

CG-106 depends on CG-102. Be careful when changing API or behavior contracts that downstream work may already assume.

Omit this section when there are no downstream dependents.

### What this means for you

Give a short practical takeaway.

Example:

Understand CG-101 and CG-105 first, then implement CG-102 using the resulting status and shared-policy contracts. Coordinate closely around shared policy code before making overlapping edits.

### Quick summary

| | |
|---|---|
| Read first | CG-101, CG-105 |
| Coordinate with | CG-101, CG-103, CG-105 |
| Highest collision | CG-105 |
| Probably unrelated | CG-104 |
| Overall | Dependencies + coordination required |
```

Keep the report compact.

Do not turn it into a design document.

---

# 12. Writing Style

Use natural developer language.

Appropriate phrases include:

```text
Heads up
Before you start
Why this matters
Watch for
Suggested order
Most important coordination point
You probably don't need to worry about
Good news
Tip
```

Avoid excessive corporate language.

Avoid verbose AI-style explanations.

Avoid repeating confidence percentages unnecessarily.

Aim for approximately:

```text
1–2 minutes to read
```

for a typical report.

---

# 13. Confidence Presentation

Confidence should be secondary.

Bad:

```text
CG-105 — 100%
```

Better:

```text
CG-105 — Shared policy logic · 100% confidence
```

Best report emphasis:

```text
Both tickets interact with the shared booking policy area.
```

followed by confidence as supporting metadata.

The developer should understand **why the relationship matters**.

---

# 14. Tips

Tips should be contextual and evidence-based.

Do not generate generic advice.

Bad:

```text
Remember to test your changes carefully.
```

Good:

```text
Tip: Check whether CG-105 has already moved this logic into BookingCutoffPolicy before adding another eligibility check.
```

Good:

```text
Tip: Confirm the hold-status values introduced by CG-101 before writing billing behavior around them.
```

Good:

```text
Tip: CG-106 depends on this ticket, so avoid changing the response contract without checking its assumptions.
```

If no meaningful evidence exists, omit the tip.

Do not invent advice.

---

# 15. Repository Relevance Language

Repository relevance remains predictive.

Use:

```text
likely files
likely modules
likely components
strongest relevance
```

Do not say:

```text
You must change these files.
```

The report is not yet an implementation plan.

Include a short reminder when showing likely files:

> Treat these as starting points, not a fixed implementation plan.

---

# 16. Agent-Facing JSON

Generate:

```text
.changeguard/reports/CG-102.json
```

The JSON should be concise and structured.

Example:

```json
{
  "schemaVersion": "1.0",

  "ticketId": "CG-102",

  "title": "Block Billing Actions for Containers on Hold",

  "status": "PREREQUISITES_AND_COORDINATION",

  "dependencyContext": {
    "directPrerequisites": [
      "CG-101",
      "CG-105"
    ],

    "allPrerequisites": [
      "CG-101",
      "CG-105"
    ],

    "dependencyPaths": [
      [
        "CG-105",
        "CG-101",
        "CG-102"
      ],
      [
        "CG-105",
        "CG-102"
      ]
    ],

    "directDependents": [],
    "allDependents": []
  },

  "repositoryRelevance": {
    "likelyModules": [],
    "likelyFiles": [],
    "relevantSymbols": []
  },

  "collisions": [
    {
      "ticketId": "CG-101",
      "confidence": 0.92,
      "sharedFiles": [],
      "sharedModules": [],
      "evidence": []
    },

    {
      "ticketId": "CG-103",
      "confidence": 0.95,
      "sharedFiles": [],
      "sharedModules": [],
      "evidence": []
    },

    {
      "ticketId": "CG-105",
      "confidence": 1.0,
      "sharedFiles": [],
      "sharedModules": [],
      "evidence": []
    }
  ],

  "unrelatedTickets": [
    "CG-104"
  ]
}
```

Do not place long natural-language prose in the JSON.

The JSON exists so another agent can consume ChangeGuard intelligence without parsing Markdown.

---

# 17. Use by Coding Agents

The JSON report may later be supplied to an implementation agent.

ChangeGuard's responsibility is to provide:

```text
ticket requirements
+
repository relevance
+
upstream dependencies
+
downstream dependencies
+
collision context
+
shared files/modules
+
evidence
```

ChangeGuard must not instruct the coding agent to blindly modify predicted files.

The implementation agent should still verify the repository.

Do not turn the report module into the future Change Planner.

---

# 18. CLI

Add:

```bash
changeguard report <ticket-id>
```

Example:

```bash
changeguard report CG-102
```

Expected console output:

```text
ChangeGuard Report

CG-102 — Block Billing Actions for Containers on Hold

⚠ Dependencies + coordination required

Prerequisites:
  CG-101
  CG-105

Collisions:
  CG-101
  CG-103
  CG-105

Developer report:
.changeguard/reports/CG-102.md

Agent context:
.changeguard/reports/CG-102.json
```

Keep the console summary short.

The Markdown report is the main human-facing artifact.

---

# 19. Missing Data

If relevance or pair-analysis files are missing:

Do not fabricate results.

Report clearly:

```text
Report cannot be generated because repository relevance analysis for CG-102 is missing.
```

or:

```text
Relationship analysis is incomplete for CG-102.
```

Prefer explicit incomplete output over invented conclusions.

---

# 20. Folder Structure

Add:

```text
changeguard/
└── .changeguard/
    ├── state.json
    ├── normalized/
    ├── requests/
    ├── analysis/
    │   ├── tickets/
    │   └── pairs/
    ├── change-graph.json
    ├── change-graph.md
    │
    └── reports/
        ├── CG-101.md
        ├── CG-101.json
        ├── CG-102.md
        └── CG-102.json
```

Suggested source modules:

```text
src/changeguard/report/
├── __init__.py
├── context.py
├── generator.py
└── renderer.py
```

Do not add more layers unless necessary.

---

# 21. Testing

Create focused tests for:

1. Report generation for a ticket with no relationships.
2. Direct prerequisite detection.
3. Transitive prerequisite traversal.
4. Direct dependent detection.
5. Transitive dependent traversal.
6. Collision aggregation.
7. Ticket with both dependency and collision.
8. Unrelated-ticket detection.
9. Correct report status derivation.
10. Markdown generation.
11. JSON generation.
12. Missing relevance analysis.
13. Missing pair analysis.
14. Cyclic dependency protection.
15. Report for non-existent ticket.
16. Existing graph with multiple dependency paths.

Do not rely solely on LLM output tests.

Test deterministic context construction separately from presentation.

---

# 22. Important Graph Safety

Protect graph traversal against accidental dependency cycles.

For example:

```text
CG-101 → CG-102
CG-102 → CG-101
```

must not cause infinite traversal.

Detect cycles and report them as graph-quality warnings.

Do not try to automatically resolve the cycle.

---

# 23. Definition of Done

The report module is complete when:

1. The user can run:

```bash
changeguard report CG-102
```

2. ChangeGuard reads existing analysis artifacts.

3. It does not rerun repository relevance or relationship analysis.

4. It computes upstream prerequisites.

5. It computes downstream dependents.

6. It collects collisions.

7. It identifies unrelated tickets.

8. It generates a concise developer-friendly Markdown report.

9. It generates structured JSON for agent consumption.

10. Tips are evidence-based and contextual.

11. Confidence is supporting information rather than the main content.

12. Repository relevance is clearly described as predictive.

13. The report stays short enough to read quickly.

14. Missing data is reported rather than fabricated.

---

# 24. Product Principle

The Change Conflict Graph answers:

> How do all pending changes relate to one another?

The Change Report answers:

> What does that mean for me if I am about to work on this ticket?

Do not simply reproduce the graph.

Interpret the existing ChangeGuard intelligence into a useful, short technical briefing.

The intended experience is:

```text
changeguard report CG-102
        ↓
"Here is what you're walking into."
        ↓
prerequisites
likely code areas
coordination risks
useful contextual tips
downstream impact
        ↓
developer starts work informed
```

Keep the feature focused on this purpose.