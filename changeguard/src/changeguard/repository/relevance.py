from pathlib import Path
import json

from changeguard.config import Config

_KEY_FILES = [
    "server/src/routes/bookings.ts",
    "server/src/db/schema.sql",
    "server/src/index.ts",
    "docs/architecture.md",
    "docs/data-model.md",
    "docs/api-reference.md",
]

_SNIPPET_LINES = 30
_MAX_CHARS = 80_000

_SYSTEM_PROMPT = """\
You are the Repo Relevance Analyst Agent for ChangeGuard.

Your job is to read a pending software change ticket and predict which parts of the
existing codebase are likely to be affected. You do NOT generate implementation steps.

You MUST respond with a single JSON object matching this exact schema:
{
  "schemaVersion": "1.0",
  "ticketId": "<id>",
  "likelyModules": ["server/src/routes", "client/src/pages"],
  "likelyFiles": [
    {
      "path": "server/src/routes/bookings.ts",
      "confidence": 0.92,
      "reason": "Contains the LIFECYCLE array that would need a new status added."
    }
  ],
  "relevantSymbols": [
    {"name": "LIFECYCLE", "path": "server/src/routes/bookings.ts"},
    {"name": "checkCutoff", "path": "server/src/routes/bookings.ts"}
  ]
}

Rules:
- Use predictive terms: likelyFiles, likelyModules, relevantSymbols
- Do NOT use: filesToModify, implementationSteps, requiredCodeChanges
- confidence is a float between 0.0 and 1.0
- Only include files and symbols you can reasonably predict from the ticket content
- Do not blindly list every file — be selective and meaningful
"""


def build_repo_context(repo_path: Path) -> str:
    sections: list[str] = []

    # File tree
    tree_lines: list[str] = []
    for search_dir in ["server/src", "client/src"]:
        d = repo_path / search_dir
        if d.exists():
            for f in sorted(d.rglob("*")):
                if f.is_file():
                    tree_lines.append(f"  {f.relative_to(repo_path)}")
    sections.append("=== FILE TREE ===\n" + "\n".join(tree_lines))

    # Key files in full
    key_section_parts: list[str] = []
    for rel in _KEY_FILES:
        fp = repo_path / rel
        if fp.exists():
            content = fp.read_text(encoding="utf-8", errors="replace")
            key_section_parts.append(f"--- {rel} ---\n{content}")
    sections.append("=== KEY FILES ===\n" + "\n\n".join(key_section_parts))

    # Other files — first N lines
    other_parts: list[str] = []
    for search_dir in ["server/src", "client/src"]:
        d = repo_path / search_dir
        if d.exists():
            for fp in sorted(d.rglob("*")):
                if fp.is_file():
                    rel = str(fp.relative_to(repo_path))
                    if rel in _KEY_FILES:
                        continue
                    lines = fp.read_text(encoding="utf-8", errors="replace").splitlines()
                    snippet = "\n".join(lines[:_SNIPPET_LINES])
                    truncated = " [truncated]" if len(lines) > _SNIPPET_LINES else ""
                    other_parts.append(f"--- {rel}{truncated} ---\n{snippet}")
    sections.append("=== OTHER FILES ===\n" + "\n\n".join(other_parts))

    result = "\n\n".join(sections)
    if len(result) > _MAX_CHARS:
        result = result[:_MAX_CHARS] + "\n\n[... context truncated to fit token budget ...]"
    return result


def analyze_relevance(
    ticket_id: str,
    normalized_md_path: Path,
    request_json_path: Path,
    repo_path: Path,
    attachments_dir: Path,
    output_root: Path,
    llm_client,
    config: "Config",
) -> None:
    normalized_md = normalized_md_path.read_text(encoding="utf-8")
    ticket_json_text = request_json_path.read_text(encoding="utf-8")
    repo_context = build_repo_context(repo_path)

    attachment_names: list[str] = []
    if attachments_dir.exists():
        attachment_names = [f.name for f in attachments_dir.iterdir() if f.is_file()]

    user_content = f"""Ticket ID: {ticket_id}

=== NORMALIZED TICKET ===
{normalized_md}

=== TICKET JSON ===
{ticket_json_text}

=== REPOSITORY CONTEXT ===
{repo_context}
"""
    if attachment_names:
        user_content += f"\nAvailable attachments: {', '.join(attachment_names)}\n"

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

    out_dir = output_root / "analysis" / "tickets"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{ticket_id}.json").write_text(
        json.dumps(parsed, indent=2), encoding="utf-8"
    )
