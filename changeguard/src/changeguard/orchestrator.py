import time
from pathlib import Path

from changeguard.config import Config
from changeguard.state import (
    load_state,
    save_state,
    get_ticket_status,
    set_ticket_status,
    get_complete_ticket_ids,
)
from changeguard.ingestion.normalizer import normalize_and_save
from changeguard.repository.relevance import analyze_relevance
from changeguard.analysis.pair_generator import missing_pairs
from changeguard.analysis.relationship import analyze_pair
from changeguard.graph.builder import build_graph
from changeguard.graph.renderer import render_json, render_markdown
from changeguard.llm import get_llm_client


def _ensure_dirs(output_root: Path) -> None:
    for sub in ["normalized", "requests", "analysis/tickets", "analysis/pairs"]:
        (output_root / sub).mkdir(parents=True, exist_ok=True)


def _scan_inbox(inbox: Path, allowed_extensions: list) -> list:
    """Return list of (ticket_id, path) tuples for all supported inbox files."""
    if not inbox.exists():
        return []
    tickets = []
    for f in sorted(inbox.iterdir()):
        if f.is_file() and f.suffix.lower() in allowed_extensions:
            tickets.append((f.stem, f))
    return tickets


def run(config: Config) -> None:
    output_root = config.output.root
    _ensure_dirs(output_root)

    state_path = output_root / "state.json"
    state = load_state(state_path)

    inbox_tickets = _scan_inbox(config.change_requests.inbox, config.ingestion.allowed_extensions)

    if not inbox_tickets:
        print("\nChangeGuard\n")
        print(f"Scanning: {config.change_requests.inbox}")
        print("\nNo tickets found in inbox.\n")
        return

    print("\nChangeGuard\n")
    print(f"Scanning:\n{config.change_requests.inbox}\n")
    print(f"{len(inbox_tickets)} ticket(s) found.\n")

    # Classify tickets
    new_tickets = []
    for ticket_id, ticket_path in inbox_tickets:
        status = get_ticket_status(state, ticket_id)
        status_label = status.upper()
        print(f"  {ticket_id:<12} {status_label}")
        if status in ("new", "failed"):
            new_tickets.append((ticket_id, ticket_path))

    print()

    if not new_tickets:
        print("No new tickets detected.\n")
        print("Change Conflict Graph is current.")
        print(f"\n  {output_root / 'change-graph.md'}\n")
        return

    llm_client = get_llm_client(config)

    normalized_dir = output_root / "normalized"
    requests_dir = output_root / "requests"
    relevance_dir = output_root / "analysis" / "tickets"
    pairs_dir = output_root / "analysis" / "pairs"

    # Step 1: Normalize new tickets (skip if outputs already exist from a prior run)
    print("Normalizing tickets...\n")
    successfully_normalized = []
    for ticket_id, ticket_path in new_tickets:
        set_ticket_status(state, ticket_id, "in_progress")
        save_state(state, state_path)
        # Skip if already normalized (interrupted mid-run)
        already_done = (
            (normalized_dir / f"{ticket_id}.md").exists()
            and (requests_dir / f"{ticket_id}.json").exists()
        )
        if already_done:
            print(f"  ✓ {ticket_id}  (cached)")
            successfully_normalized.append(ticket_id)
            continue
        try:
            normalize_and_save(
                ticket_id=ticket_id,
                source_file=ticket_path,
                attachments_dir=config.change_requests.attachments,
                normalized_dir=normalized_dir,
                requests_dir=requests_dir,
                llm_client=llm_client,
                config=config,
            )
            print(f"  ✓ {ticket_id}")
            successfully_normalized.append(ticket_id)
        except Exception as exc:
            print(f"  ✗ {ticket_id}  ERROR: {exc}")
            set_ticket_status(state, ticket_id, "failed")
            save_state(state, state_path)

    print()

    # Step 2: Repository relevance for normalized tickets
    print("Analyzing repository relevance...\n")
    successfully_analyzed = []
    for ticket_id in successfully_normalized:
        try:
            analyze_relevance(
                ticket_id=ticket_id,
                normalized_md_path=normalized_dir / f"{ticket_id}.md",
                request_json_path=requests_dir / f"{ticket_id}.json",
                repo_path=config.repository.path,
                attachments_dir=config.change_requests.attachments,
                output_root=output_root,
                llm_client=llm_client,
                config=config,
            )
            print(f"  ✓ {ticket_id}")
            successfully_analyzed.append(ticket_id)
        except Exception as exc:
            print(f"  ✗ {ticket_id}  ERROR: {exc}")
            set_ticket_status(state, ticket_id, "failed")
            save_state(state, state_path)

    print()

    # Step 3: Pair relationship analysis
    all_complete = get_complete_ticket_ids(state)
    all_processed = list(set(all_complete + successfully_analyzed))

    pairs_to_analyze = missing_pairs(
        new_ids=successfully_analyzed,
        all_ids=all_processed,
        pairs_dir=pairs_dir,
    )

    if pairs_to_analyze:
        print("Analyzing ticket relationships...\n")
        for i, (ticket_a, ticket_b) in enumerate(pairs_to_analyze):
            label = f"{ticket_a} ↔ {ticket_b}"
            if i > 0:
                time.sleep(3)  # avoid free-tier rate limits
            try:
                analyze_pair(
                    ticket_a=ticket_a,
                    ticket_b=ticket_b,
                    normalized_dir=normalized_dir,
                    requests_dir=requests_dir,
                    relevance_dir=relevance_dir,
                    output_root=output_root,
                    llm_client=llm_client,
                    config=config,
                )
                print(f"  ✓ {label}")
            except Exception as exc:
                print(f"  ✗ {label}  ERROR: {exc}")
        print()

    # Mark successfully analyzed tickets as complete
    for ticket_id in successfully_analyzed:
        set_ticket_status(state, ticket_id, "complete")
    save_state(state, state_path)

    # Step 4: Rebuild graph if any work was done
    any_work = bool(successfully_analyzed or pairs_to_analyze)
    if any_work:
        try:
            graph = build_graph(pairs_dir, requests_dir, config)
            render_json(graph, output_root / "change-graph.json")
            render_markdown(graph, output_root / "change-graph.md")
        except Exception as exc:
            print(f"  ✗ Graph generation failed: {exc}\n")
            return

    # Summary
    all_state = load_state(state_path)
    dep_count = 0
    col_count = 0
    ind_count = 0

    import json
    for pf in pairs_dir.glob("*.json"):
        try:
            d = json.loads(pf.read_text())
            if d.get("logicalDependency", {}).get("exists"):
                dep_count += 1
            if d.get("changeCollision", {}).get("exists"):
                col_count += 1
            if d.get("independent"):
                ind_count += 1
        except Exception:
            pass

    print("Analysis complete.\n")
    print(f"  Logical dependencies : {dep_count}")
    print(f"  Change collisions    : {col_count}")
    print(f"  Independent tickets  : {len(graph.independentTickets) if any_work else 'n/a'}")
    print(f"\nConflict graph:\n  {output_root / 'change-graph.md'}\n")


def run_report(ticket_id: str, config: Config) -> None:
    """Generate a developer brief and agent-facing JSON for a single ticket.

    Reads from existing ChangeGuard artifacts — never re-runs analysis.
    Writes to:
        .changeguard/reports/<ticket_id>.md   (human developer brief)
        .changeguard/reports/<ticket_id>.json (agent-facing context)
    """
    import sys

    from changeguard.report.context import (
        build_report_context,
        MissingTicketError,
        MissingRelevanceError,
        MissingGraphError,
    )
    from changeguard.report.generator import generate_report
    from changeguard.report.renderer import render_markdown, render_json, render_pdf

    output_root = config.output.root
    reports_dir = output_root / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)

    # ── Build deterministic context ──────────────────────────────────────────
    try:
        context = build_report_context(ticket_id, output_root)
    except MissingTicketError as exc:
        print(f"\nChangeGuard Report\n\nError: {exc}\n", file=sys.stderr)
        sys.exit(1)
    except MissingRelevanceError as exc:
        print(f"\nChangeGuard Report\n\nError: {exc}\n", file=sys.stderr)
        sys.exit(1)
    except MissingGraphError as exc:
        print(f"\nChangeGuard Report\n\nError: {exc}\n", file=sys.stderr)
        sys.exit(1)

    # ── Console summary (§18) ────────────────────────────────────────────────
    _STATUS_LABELS = {
        "READY": "✅ Ready to start",
        "PREREQUISITES_PRESENT": "⏳ Prerequisites present",
        "COORDINATION_REQUIRED": "⚠️  Coordination required",
        "PREREQUISITES_AND_COORDINATION": "⚠️  Dependencies + coordination required",
    }
    status_label = _STATUS_LABELS.get(context.status, context.status)

    print(f"\nChangeGuard Report\n")
    print(f"{context.ticketId} — {context.title}\n")
    print(f"{status_label}\n")

    if context.dependencyContext.directPrerequisites:
        print("Prerequisites:")
        for p in context.dependencyContext.directPrerequisites:
            print(f"  {p}")
        print()

    if context.collisions:
        print("Collisions:")
        for c in context.collisions:
            print(f"  {c.ticketId}")
        print()

    if context.graphWarnings:
        print("Graph warnings:")
        for w in context.graphWarnings:
            print(f"  ⚠  {w}")
        print()

    # ── Generate report ──────────────────────────────────────────────────────
    print("Generating report...\n")
    llm_client = get_llm_client(config)

    try:
        markdown = generate_report(context, llm_client, config.llm.model)
    except Exception as exc:
        print(f"Error generating report: {exc}\n", file=sys.stderr)
        sys.exit(1)

    # ── Write output files ───────────────────────────────────────────────────
    md_path = reports_dir / f"{context.ticketId}.md"
    json_path = reports_dir / f"{context.ticketId}.json"
    pdf_path = reports_dir / f"{context.ticketId}.pdf"

    render_markdown(markdown, md_path)
    render_json(context, json_path)

    try:
        render_pdf(markdown, pdf_path)
    except Exception as exc:
        print(f"  ⚠  PDF generation failed: {exc}\n", file=sys.stderr)
        pdf_path = None

    print(f"Developer report:\n  {md_path}\n")
    print(f"Agent context:\n  {json_path}\n")
    if pdf_path and pdf_path.exists():
        print(f"PDF report:\n  {pdf_path}\n")
