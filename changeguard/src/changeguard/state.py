"""State management for changeguard/.changeguard/state.json.

Ticket lifecycle statuses:
    new         — seen in inbox, not yet processed
    in_progress — currently being processed (should not persist across runs)
    complete    — all pipeline stages finished successfully
    failed      — at least one stage failed; eligible for retry
"""

from __future__ import annotations

import json
from pathlib import Path

STATUSES = {"new", "in_progress", "complete", "failed"}


def load_state(path: Path) -> dict:
    """Load state from *path*.

    Returns ``{"schemaVersion": "1.0", "tickets": {}}`` if the file does not
    exist yet.
    """
    if not path.exists():
        return {"schemaVersion": "1.0", "tickets": {}}
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def save_state(state: dict, path: Path) -> None:
    """Write *state* to *path* as pretty-printed JSON."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, indent=2)
        fh.write("\n")


def get_ticket_status(state: dict, ticket_id: str) -> str:
    """Return the status string for *ticket_id*.

    Returns ``"new"`` when the ticket is absent from state entirely.
    """
    return state.get("tickets", {}).get(ticket_id, {}).get("status", "new")


def set_ticket_status(state: dict, ticket_id: str, status: str) -> None:
    """Mutate *state* in place, setting *ticket_id* status to *status*."""
    if status not in STATUSES:
        raise ValueError(f"Unknown status {status!r}; expected one of {STATUSES}")
    tickets = state.setdefault("tickets", {})
    ticket = tickets.setdefault(ticket_id, {})
    ticket["status"] = status


def get_complete_ticket_ids(state: dict) -> list[str]:
    """Return all ticket IDs whose status is ``"complete"``."""
    return [
        tid
        for tid, info in state.get("tickets", {}).items()
        if info.get("status") == "complete"
    ]
