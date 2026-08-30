from pathlib import Path
import itertools


def generate_all_pairs(ticket_ids: list) -> list:
    """Return all unique sorted pairs of ticket IDs (N choose 2)."""
    sorted_ids = sorted(ticket_ids)
    return list(itertools.combinations(sorted_ids, 2))


def missing_pairs(new_ids: list, all_ids: list, pairs_dir: Path) -> list:
    """
    Returns pairs that involve at least one new_id and don't already
    have a .json file in pairs_dir.
    """
    all_ids_set = set(all_ids)
    new_ids_set = set(new_ids)

    result = []
    for a, b in itertools.combinations(sorted(all_ids_set), 2):
        # Only include pairs that involve at least one new ticket
        if a not in new_ids_set and b not in new_ids_set:
            continue
        filename = f"{a}__{b}.json"
        if not (pairs_dir / filename).exists():
            result.append((a, b))
    return result
