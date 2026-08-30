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
    # Key validation is handled by llm.get_llm_client() per provider.

    if config_path is None:
        config_path = Path.cwd() / "changeguard.yaml"
        if not config_path.exists():
            click.echo(
                f"Error: No changeguard.yaml found in {Path.cwd()}.\n"
                "Pass --config <path> or run from the changeguard/ directory.",
                err=True,
            )
            sys.exit(1)

    config = load_config(config_path)

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
    if config_path is None:
        config_path = Path.cwd() / "changeguard.yaml"
        if not config_path.exists():
            click.echo(
                f"Error: No changeguard.yaml found in {Path.cwd()}.\n"
                "Pass --config <path> or run from the changeguard/ directory.",
                err=True,
            )
            sys.exit(1)

    config = load_config(config_path)

    from changeguard import orchestrator  # noqa: PLC0415

    orchestrator.run_report(ticket_id, config)
