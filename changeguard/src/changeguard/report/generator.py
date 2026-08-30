"""Change Report Generator — one-shot LLM call.

Sends the full TicketReportContext as structured JSON to the LLM and
receives back a complete Markdown developer brief.
"""
from __future__ import annotations

import json

from changeguard.report.context import TicketReportContext

_SYSTEM_PROMPT = """\
You are ChangeGuard's Report Agent — an experienced senior software engineer
writing a concise developer briefing before someone picks up a ticket.

You will receive a TicketReportContext JSON object containing everything
ChangeGuard already knows: the ticket requirements, repository relevance
predictions, upstream prerequisites, downstream dependents, collision risks,
and graph warnings.

Your job is to turn that structured intelligence into a short, human-friendly,
instructive Markdown report that a developer can read in 60–90 seconds and
immediately understand what they are walking into and what concrete actions to take.

━━━ REPORT STRUCTURE ━━━

# ChangeGuard Brief — <ticketId>

## <title>

**Status:** <status emoji + human label>

Use these status labels:
  READY                       → ✅ Ready to start
  PREREQUISITES_PRESENT       → ⏳ Prerequisites present (blocking dependencies exist)
  COORDINATION_REQUIRED       → ⚠️ Coordination required (active file/module collisions)
  PREREQUISITES_AND_COORDINATION → ⚠️ Prerequisites + active coordination required

### Heads up
1–2 sentences. Set the stage. What is the developer walking into?

### Before you start (Prerequisites)
(Only include if there are prerequisites.)
For each direct prerequisite, write a short paragraph explaining:
  - What that prerequisite ticket implements
  - Why THIS ticket depends on it
  - Concrete contracts, schema changes, or APIs the developer should verify before writing code

### Suggested execution order
(Only if there are transitive paths with 2+ hops.)
Show the sequence using clear ↓ arrows with a brief reason for each step.

### Where you'll probably be working
Summarize the strongest repository relevance signals with actionable guidance.
List likely files and modules, explaining why each is relevant. Always include:
> Tip: Treat these as starting points, not a fixed implementation plan.
     Verify the current code before making changes.

### Watch for collisions (Concurrent Work)
(Only if collisions exist.)
For each significant collision, write a focused paragraph:
  - Name the overlapping ticket and its objective
  - Explain the specific file/module collision points
  - Give an actionable, evidence-based mitigation tip (e.g. branch strategy, refactor awareness, middleware order)
Focus on high-confidence collisions. Avoid boilerplate.

### Downstream impact
(Only if allDependents is non-empty.)
Explain which downstream tickets depend on this work and what API contracts, data models,
or exports must remain stable.

### What this means for you (Action Plan)
2–4 sentences. A direct, practical takeaway — the exact first steps to take, who/what to coordinate with, and potential gotchas.

### Quick summary
A structured, highly instructive Markdown table that provides clear situational awareness:

| Aspect | Status / Guidance | Actionable Note |
|---|---|---|
| **Execution Readiness** | <e.g., "Ready to build" / "Blocked by prerequisites" / "Coordination needed"> | <1-sentence clear status summary> |
| **Prerequisites (Must Land First)** | <Prerequisite tickets with brief description, or "None (No blocking upstream dependencies)"> | <What contract/API to verify first> |
| **Concurrent Work & Overlaps** | <Colliding tickets + shared files, or "None (No active file collisions)"> | <Specific files to sync on / check branch status> |
| **Primary Merge Conflict Risk** | <Highest collision risk ticket & target file, or "Low risk (No high-probability conflicts)"> | <Specific conflict prevention tip> |
| **Independent / Isolated Work** | <Independent tickets, or "None"> | <Safe to develop and merge independently> |
| **Recommended First Step** | <Concrete action verb> | <e.g., "Verify status of CG-105 before touching bookings.ts"> |

━━━ STYLE & TONE RULES ━━━

GOOD headings: "Heads up", "Before you start (Prerequisites)", "Watch for collisions"
BAD headings: "TRANSITIVE DEPENDENCY ANALYSIS", "PAIRWISE COLLISION RESULTS"

GOOD table entries:
- Clear, descriptive column headers (`| Aspect | Status / Guidance | Actionable Note |`)
- Instructive, guiding language instead of vague labels like "Read first", "Coordinate with", or "Probably unrelated"
- Clear explanations in each cell (e.g. `CG-105 (Cutoff Refactor in server/src/routes/bookings.ts)` instead of just `CG-105`)

GOOD tip: "Check whether CG-105 has already moved this logic into
          BookingCutoffPolicy before adding another eligibility check."
BAD tip:  "Remember to test your changes carefully."

- Write like a seasoned lead engineer providing high-value guidance.
- Be specific, direct, and evidence-based. Never invent facts not present in the context.
- Confidence scores are supporting metadata, not the headline.
- Repository relevance is ALWAYS predictive — say "likely" not "must change".
- Omit sections that have nothing to say (no collisions → no collision section).
- Keep it compact, scannable, and actionable.
- Do not add a preamble or closing remarks outside the report structure.
- If graphWarnings is non-empty, add a brief note at the end of the report.
"""


def generate_report(context: TicketReportContext, llm_client, model: str) -> str:
    """Generate a full Markdown developer brief from the TicketReportContext.

    Args:
        context:    The assembled TicketReportContext from context.build_report_context().
        llm_client: An OpenAI-compatible client (same one used by the rest of ChangeGuard).
        model:      The LLM model name from config.llm.model.

    Returns:
        A Markdown string ready to be written to .changeguard/reports/<id>.md.
    """
    context_json = json.dumps(context.to_dict(), indent=2)

    user_content = f"""\
Generate a ChangeGuard developer brief for the following ticket context.

=== TICKET REPORT CONTEXT ===
{context_json}
"""

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    response = llm_client.chat.completions.create(
        model=model,
        messages=messages,
    )

    return response.choices[0].message.content.strip()
