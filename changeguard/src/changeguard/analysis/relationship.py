from pathlib import Path
import json

from changeguard.config import Config

_SYSTEM_PROMPT = """\
You are the Relationship Analyst Agent for ChangeGuard.

Your job is to compare two pending software change tickets and determine:
1. Whether a logical dependency exists between them
2. Whether a change collision exists between them
3. Whether the pair is independent

You MUST respond with a single JSON object matching this exact schema:
{
  "schemaVersion": "1.0",
  "tickets": ["<ticket_a>", "<ticket_b>"],
  "logicalDependency": {
    "exists": true,
    "prerequisite": "<ticket_id or null>",
    "dependent": "<ticket_id or null>",
    "confidence": 0.92,
    "evidence": ["<factual sentence about why>"]
  },
  "changeCollision": {
    "exists": true,
    "confidence": 0.86,
    "sharedFiles": ["server/src/routes/bookings.ts"],
    "sharedModules": ["server/src/routes"],
    "evidence": ["Both tickets affect the LIFECYCLE array in bookings.ts."]
  },
  "independent": false
}

Critical rules:
- LOGICAL DEPENDENCY: directional. One ticket requires something introduced by the other.
  Direction: prerequisite → dependent. Do NOT infer dependency merely because tickets touch the same file.
- CHANGE COLLISION: non-directional. Both tickets likely affect the same or tightly coupled areas.
  Set exists=true if they share a file, class, function, module, API contract, or schema.
- INDEPENDENT: set to true if AND ONLY IF logicalDependency.exists==false AND changeCollision.exists==false.
  Otherwise set to false.
- A collision does NOT imply a logical dependency — they are independent dimensions.
- Evidence must be concise factual statements. Never write "the AI believes...".
- If logicalDependency.exists is false, set prerequisite and dependent to null.
- confidence values are floats between 0.0 and 1.0.
"""


def analyze_pair(
    ticket_a: str,
    ticket_b: str,
    normalized_dir: Path,
    requests_dir: Path,
    relevance_dir: Path,
    output_root: Path,
    llm_client,
    config: "Config",
) -> None:
    # Always store with sorted (lesser) ID first
    a, b = tuple(sorted([ticket_a, ticket_b]))

    md_a = (normalized_dir / f"{a}.md").read_text(encoding="utf-8")
    md_b = (normalized_dir / f"{b}.md").read_text(encoding="utf-8")
    rel_a = (relevance_dir / f"{a}.json").read_text(encoding="utf-8")
    rel_b = (relevance_dir / f"{b}.json").read_text(encoding="utf-8")

    dep_thresh = config.analysis.dependency_confidence_threshold
    col_thresh = config.analysis.collision_confidence_threshold

    user_content = f"""Compare these two pending change tickets.

Confidence thresholds for this analysis:
- Logical dependency: {dep_thresh}
- Change collision: {col_thresh}

=== TICKET {a} — NORMALIZED ===
{md_a}

=== TICKET {a} — RELEVANCE ANALYSIS ===
{rel_a}

=== TICKET {b} — NORMALIZED ===
{md_b}

=== TICKET {b} — RELEVANCE ANALYSIS ===
{rel_b}
"""

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    try:
        response = llm_client.chat.completions.create(
            model=config.llm.model,
            messages=messages,
            response_format={"type": "json_object"},
        )
    except Exception:
        response = llm_client.chat.completions.create(
            model=config.llm.model,
            messages=messages,
        )

    raw_response = response.choices[0].message.content
    parsed = json.loads(raw_response)

    # Enforce independent correctness regardless of what the LLM returned
    dep_exists = parsed.get("logicalDependency", {}).get("exists", False)
    col_exists = parsed.get("changeCollision", {}).get("exists", False)
    parsed["independent"] = not dep_exists and not col_exists

    out_dir = output_root / "analysis" / "pairs"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{a}__{b}.json").write_text(
        json.dumps(parsed, indent=2), encoding="utf-8"
    )
