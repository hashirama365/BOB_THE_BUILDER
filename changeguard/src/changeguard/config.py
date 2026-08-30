"""Configuration loading for ChangeGuard."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class LlmConfig:
    model: str
    base_url: str | None = None  # Optional; provider default used when omitted


@dataclass
class RepositoryConfig:
    path: Path


@dataclass
class ChangeRequestsConfig:
    inbox: Path
    attachments: Path


@dataclass
class OutputConfig:
    root: Path


@dataclass
class IngestionConfig:
    allowed_extensions: list[str] = field(default_factory=lambda: [".md", ".txt", ".pdf", ".docx"])


@dataclass
class AnalysisConfig:
    dependency_confidence_threshold: float = 0.70
    collision_confidence_threshold: float = 0.70


@dataclass
class Config:
    llm: LlmConfig
    repository: RepositoryConfig
    change_requests: ChangeRequestsConfig
    output: OutputConfig
    ingestion: IngestionConfig
    analysis: AnalysisConfig
    version: int = 1
    # Path to the loaded changeguard.yaml — used to resolve sibling files (e.g. key file)
    _config_path: Path = field(default_factory=Path, repr=False)


def load_config(path: Path) -> Config:
    """Load and validate changeguard.yaml, resolving all paths relative to the config file."""
    path = Path(path).resolve()
    base = path.parent

    with path.open() as fh:
        raw = yaml.safe_load(fh)

    def _resolve(p: str) -> Path:
        return (base / p).resolve()

    llm_raw = raw.get("llm", {})
    repo_raw = raw.get("repository", {})
    cr_raw = raw.get("change_requests", {})
    out_raw = raw.get("output", {})
    ing_raw = raw.get("ingestion", {})
    ana_raw = raw.get("analysis", {})

    cfg = Config(
        version=raw.get("version", 1),
        llm=LlmConfig(
            model=llm_raw["model"],
            base_url=llm_raw.get("base_url"),  # None when not specified
        ),
        repository=RepositoryConfig(
            path=_resolve(repo_raw["path"]),
        ),
        change_requests=ChangeRequestsConfig(
            inbox=_resolve(cr_raw["inbox"]),
            attachments=_resolve(cr_raw["attachments"]),
        ),
        output=OutputConfig(
            root=_resolve(out_raw["root"]),
        ),
        ingestion=IngestionConfig(
            allowed_extensions=ing_raw.get("allowed_extensions", [".md", ".txt", ".pdf", ".docx"]),
        ),
        analysis=AnalysisConfig(
            dependency_confidence_threshold=ana_raw.get("dependency_confidence_threshold", 0.70),
            collision_confidence_threshold=ana_raw.get("collision_confidence_threshold", 0.70),
        ),
    )
    cfg._config_path = path
    return cfg
