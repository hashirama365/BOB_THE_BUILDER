"""ChangeGuard CLI entry point."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import click

from changeguard.config import load_config


@click.group()
def main() -> None:
    """ChangeGuard — change intelligence workflow powered by Bob."""


def _resolve_config_path(config_path: Path | None) -> Path:
    if config_path is not None:
        return config_path
    candidates = [
        Path.cwd() / "changeguard.yaml",
        Path.cwd() / "changeguard" / "changeguard.yaml",
        Path.cwd() / "BOB_THE_BUILDER" / "changeguard" / "changeguard.yaml",
    ]
    for p in candidates:
        if p.exists():
            return p
    click.echo(
        f"Error: No changeguard.yaml found in {Path.cwd()} or {Path.cwd() / 'changeguard'}.\n"
        "Pass --config <path> or run from the changeguard/ directory.",
        err=True,
    )
    sys.exit(1)


@main.command()
@click.option(
    "--config",
    "config_path",
    default=None,
    type=click.Path(exists=True, path_type=Path),
    help="Path to changeguard.yaml (default: ./changeguard.yaml).",
)
def run(config_path: Path | None) -> None:
    """Analyze change requests and produce the Change Conflict Graph."""
    resolved_config_path = _resolve_config_path(config_path)
    config = load_config(resolved_config_path)

    # Import here so the stub absence during scaffolding doesn't break the import graph.
    from changeguard import orchestrator  # noqa: PLC0415

    orchestrator.run(config)


@main.command()
@click.argument("ticket_id")
@click.option(
    "--config",
    "config_path",
    default=None,
    type=click.Path(exists=True, path_type=Path),
    help="Path to changeguard.yaml (default: ./changeguard.yaml).",
)
def report(ticket_id: str, config_path: Path | None) -> None:
    """Generate a developer brief for a specific ticket.

    TICKET_ID is the ticket to report on, e.g. CG-102.
    """
    resolved_config_path = _resolve_config_path(config_path)
    config = load_config(resolved_config_path)

    from changeguard import orchestrator  # noqa: PLC0415

    orchestrator.run_report(ticket_id, config)

