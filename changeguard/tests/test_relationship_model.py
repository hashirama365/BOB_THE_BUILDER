"""Test PairAnalysis independence logic (no LLM calls)."""
from changeguard.models import (
    PairAnalysis,
    LogicalDependency,
    ChangeCollision,
)


def _make_pair(dep_exists: bool, col_exists: bool) -> PairAnalysis:
    dep = LogicalDependency(
        exists=dep_exists,
        prerequisite="CG-101" if dep_exists else None,
        dependent="CG-102" if dep_exists else None,
        confidence=0.9 if dep_exists else 0.0,
        evidence=["test evidence"] if dep_exists else [],
    )
    col = ChangeCollision(
        exists=col_exists,
        confidence=0.85 if col_exists else 0.0,
        sharedFiles=["server/src/routes/bookings.ts"] if col_exists else [],
        sharedModules=["server/src/routes"] if col_exists else [],
        evidence=["shared file"] if col_exists else [],
    )
    independent = not dep_exists and not col_exists
    return PairAnalysis(
        schemaVersion="1.0",
        tickets=["CG-101", "CG-102"],
        logicalDependency=dep,
        changeCollision=col,
        independent=independent,
    )


def test_both_true_means_not_independent():
    pair = _make_pair(dep_exists=True, col_exists=True)
    assert pair.independent is False


def test_both_false_means_independent():
    pair = _make_pair(dep_exists=False, col_exists=False)
    assert pair.independent is True


def test_dep_only_not_independent():
    pair = _make_pair(dep_exists=True, col_exists=False)
    assert pair.independent is False


def test_col_only_not_independent():
    pair = _make_pair(dep_exists=False, col_exists=True)
    assert pair.independent is False
