"""Test pair generation logic."""
import tempfile
from pathlib import Path

from changeguard.analysis.pair_generator import generate_all_pairs, missing_pairs


def test_three_tickets_yield_three_pairs():
    pairs = generate_all_pairs(["CG-101", "CG-102", "CG-103"])
    assert len(pairs) == 3


def test_pairs_are_sorted():
    pairs = generate_all_pairs(["CG-102", "CG-101"])
    assert pairs == [("CG-101", "CG-102")]


def test_no_reversed_duplicates():
    pairs = generate_all_pairs(["CG-101", "CG-102", "CG-103"])
    pair_set = set(pairs)
    # No pair appears as both (a, b) and (b, a)
    for a, b in pairs:
        assert (b, a) not in pair_set


def test_incremental_missing_pairs_skips_existing():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs_dir = Path(tmpdir)
        # Simulate CG-101__CG-102 already analyzed
        (pairs_dir / "CG-101__CG-102.json").write_text("{}")

        result = missing_pairs(
            new_ids=["CG-104"],
            all_ids=["CG-101", "CG-102", "CG-103", "CG-104"],
            pairs_dir=pairs_dir,
        )
        pair_names = [f"{a}__{b}" for a, b in result]
        # The already-existing pair should not be re-included
        assert "CG-101__CG-102" not in pair_names
        # New pairs involving CG-104 must all be present
        assert "CG-101__CG-104" in pair_names
        assert "CG-102__CG-104" in pair_names
        assert "CG-103__CG-104" in pair_names
