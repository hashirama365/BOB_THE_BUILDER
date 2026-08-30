import json
import os
from pathlib import Path

from changeguard.config import Config

# ── IBM / Bob ──────────────────────────────────────────────────────────────────
_IBM_PLACEHOLDER_URL = "https://YOUR_INSTANCE.bob.ibm.com/v1"

# ── Google Gemini ──────────────────────────────────────────────────────────────
# Gemini exposes an OpenAI-compatible REST endpoint — no separate SDK needed.
_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _load_json_sidecar(config_path: Path, filename: str) -> dict:
    """Load a JSON sidecar file from the same directory as changeguard.yaml."""
    sidecar = config_path.parent / filename
    if sidecar.exists():
        try:
            return json.loads(sidecar.read_text())
        except Exception:
            return {}
    return {}


def _is_gemini_model(model: str) -> bool:
    m = model.lower()
    return m.startswith("gemini") or m.startswith("models/gemini")


def get_llm_client(config: Config):
    """Return an OpenAI-compatible client for the configured LLM provider.

    Supported providers
    -------------------
    Google Gemini  (model starts with "gemini-…")
        API key resolution order:
          1. GEMINI_API_KEY environment variable
          2. 'apikey' field in changeguard_gemini_key.json (next to changeguard.yaml)

        Base URL: always https://generativelanguage.googleapis.com/v1beta/openai/
                  (overridable via llm.base_url in changeguard.yaml)

    IBM / Bob  (any other model)
        API key resolution order:
          1. BOB_API_KEY environment variable
          2. 'apikey' field in changeguard_ibm_key.json (next to changeguard.yaml)

        Base URL resolution order:
          1. llm.base_url in changeguard.yaml (if not the placeholder)
          2. 'base_url' field in changeguard_ibm_key.json
    """
    from openai import OpenAI

    model = config.llm.model

    # ── Google Gemini ──────────────────────────────────────────────────────────
    if _is_gemini_model(model):
        key_data = _load_json_sidecar(config._config_path, "changeguard_gemini_key.json")

        api_key = os.environ.get("GEMINI_API_KEY") or key_data.get("apikey")
        if not api_key:
            raise EnvironmentError(
                "No Gemini API key found.\n"
                "Either set the GEMINI_API_KEY environment variable:\n"
                "  export GEMINI_API_KEY=your-key-here\n"
                "Or create changeguard/changeguard_gemini_key.json with:\n"
                '  {"apikey": "your-key-here"}'
            )

        # Allow overriding the base URL from config (e.g. Vertex AI endpoint)
        base_url = config.llm.base_url or _GEMINI_BASE_URL

        return OpenAI(api_key=api_key, base_url=base_url)

    # ── IBM / Bob ──────────────────────────────────────────────────────────────
    key_data = _load_json_sidecar(config._config_path, "changeguard_ibm_key.json")

    api_key = os.environ.get("BOB_API_KEY") or key_data.get("apikey")
    if not api_key:
        raise EnvironmentError(
            "No Bob API key found.\n"
            "Either set the BOB_API_KEY environment variable:\n"
            "  export BOB_API_KEY=your-key-here\n"
            "Or ensure 'apikey' is present in changeguard/changeguard_ibm_key.json."
        )

    base_url = config.llm.base_url
    if not base_url or base_url == _IBM_PLACEHOLDER_URL:
        base_url = key_data.get("base_url")

    if not base_url or base_url == _IBM_PLACEHOLDER_URL:
        raise EnvironmentError(
            "Bob inference base_url is not configured.\n"
            "Set it in changeguard/changeguard.yaml:\n"
            "  llm:\n"
            "    base_url: https://your-instance.bob.ibm.com/v1\n"
            "Or add a 'base_url' field to changeguard/changeguard_ibm_key.json."
        )

    return OpenAI(api_key=api_key, base_url=base_url)
