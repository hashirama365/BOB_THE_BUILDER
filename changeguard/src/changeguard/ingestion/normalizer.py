from pathlib import Path
import json

from changeguard.ingestion.extractors import extract
from changeguard.config import Config

_SYSTEM_PROMPT = """\
You are the Ticket Creator Agent for ChangeGuard.

Your job is to convert a raw change-request document into ChangeGuard's canonical
representation. You must respond with a single JSON object containing exactly two keys:

1. "normalized_markdown" — a string containing canonical Markdown in this exact format:
---
id: <ticket_id>
source: <source_filename>
---

# <ticket_id> — <title>

## Summary

<one paragraph summary>

## Requirements

- <requirement 1>
- <requirement 2>

## Acceptance Criteria

- <criterion 1>

## References

- <reference 1>

2. "ticket_json" — a JSON object with this schema:
{
  "schemaVersion": "1.0",
  "id": "<ticket_id>",
  "title": "<short title>",
  "source": {"path": "<source_path>", "type": "<extension without dot>"},
  "summary": "<one sentence>",
  "requirements": ["<req 1>", "..."],
  "acceptanceCriteria": ["<criterion 1>", "..."],
  "references": ["<reference 1>", "..."]
}

Rules:
- Do NOT invent missing requirements. If a section is absent, use an empty list.
- Keep titles concise (5-8 words).
- Extract only what is in the source text.
"""


def normalize_and_save(
    ticket_id: str,
    source_file: Path,
    attachments_dir: Path,
    normalized_dir: Path,
    requests_dir: Path,
    llm_client,
    config: "Config",
) -> None:
    raw_text = extract(source_file)

    attachment_names = []
    if attachments_dir.exists():
        attachment_names = [f.name for f in attachments_dir.iterdir() if f.is_file()]

    user_content = f"""Ticket ID: {ticket_id}
Source file: {source_file.name}

--- RAW DOCUMENT ---
{raw_text}
--- END DOCUMENT ---
"""
    if attachment_names:
        user_content += (
            f"\nAvailable attachments (not read): {', '.join(attachment_names)}\n"
        )

    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    # Attempt with JSON mode first; fall back if the model doesn't support it
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

    normalized_md: str = parsed["normalized_markdown"]
    ticket_json: dict = parsed["ticket_json"]

    normalized_dir.mkdir(parents=True, exist_ok=True)
    requests_dir.mkdir(parents=True, exist_ok=True)

    (normalized_dir / f"{ticket_id}.md").write_text(normalized_md, encoding="utf-8")
    (requests_dir / f"{ticket_id}.json").write_text(
        json.dumps(ticket_json, indent=2), encoding="utf-8"
    )
