"""Test state management logic."""
import json
import tempfile
from pathlib import Path

from changeguard.state import (
    load_state,
    save_state,
    get_ticket_status,
    set_ticket_status,
    get_complete_ticket_ids,
)


def test_absent_ticket_is_new():
    state = {"schemaVersion": "1.0", "tickets": {}}
    assert get_ticket_status(state, "CG-101") == "new"


def test_complete_ticket_is_skipped():
    state = {
        "schemaVersion": "1.0",
        "tickets": {"CG-101": {"status": "complete"}},
    }
    assert get_ticket_status(state, "CG-101") == "complete"
    complete_ids = get_complete_ticket_ids(state)
    assert "CG-101" in complete_ids


def test_failed_ticket_is_retried():
    state = {
        "schemaVersion": "1.0",
        "tickets": {"CG-101": {"status": "failed"}},
    }
    status = get_ticket_status(state, "CG-101")
    # failed tickets should be included for retry (status != "complete")
    assert status == "failed"
    assert "CG-101" not in get_complete_ticket_ids(state)


def test_state_persists_to_disk():
    state = {"schemaVersion": "1.0", "tickets": {}}
    set_ticket_status(state, "CG-200", "complete")

    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / "state.json"
        save_state(state, path)
        loaded = load_state(path)

    assert loaded["tickets"]["CG-200"]["status"] == "complete"


def test_load_state_returns_default_when_missing():
    state = load_state(Path("/nonexistent/path/state.json"))
    assert state == {"schemaVersion": "1.0", "tickets": {}}
