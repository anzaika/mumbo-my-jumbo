"""Shared fixtures and helpers for mumbo-my-jumbo tests."""

import json
import shutil
import sys
from pathlib import Path

import pytest

# Make scripts/ importable
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

FIXTURE_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_dir():
    """Return the path to the fixtures directory."""
    return FIXTURE_DIR


def discover_fixture_ids():
    """Discover fixture IDs by globbing for *.key.json files."""
    return sorted(
        p.stem.replace(".key", "")
        for p in FIXTURE_DIR.glob("*.key.json")
    )


def load_answer_key(fixture_id: str) -> dict:
    """Load the answer key for a fixture."""
    path = FIXTURE_DIR / f"{fixture_id}.key.json"
    with open(path) as f:
        data = json.load(f)
    return data["entities"]


def load_map(fixture_id: str) -> dict:
    """Load the replacement map for a fixture."""
    path = FIXTURE_DIR / f"{fixture_id}.map.json"
    with open(path) as f:
        return json.load(f)


@pytest.fixture
def tmp_fixture(tmp_path):
    """Return a helper that copies a fixture .md to tmp_path and returns the copy path."""
    def _copy(fixture_id: str) -> Path:
        src = FIXTURE_DIR / f"{fixture_id}.md"
        dst = tmp_path / f"{fixture_id}.md"
        shutil.copy2(src, dst)
        return dst
    return _copy


@pytest.fixture
def llm_judge():
    """Return a callable that invokes Haiku as an LLM judge for obfuscation quality.

    Returns None if anthropic is not installed or ANTHROPIC_API_KEY is not set.
    """
    try:
        import anthropic
    except ImportError:
        pytest.skip("anthropic SDK not installed")

    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY not set")

    client = anthropic.Anthropic()

    def _judge(original: str, obfuscated: str, replacement_map: dict) -> dict:
        prompt = f"""You are a security reviewer checking whether obfuscation was successful.

## Original Document
{original}

## Obfuscated Document
{obfuscated}

## Replacement Map
{json.dumps(replacement_map, indent=2)}

Check if ANY sensitive information from the original survives in the obfuscated version:
- Exact entity matches
- Partial entity matches (substrings that could identify real entities)
- Entities missed entirely
- Contextual clues that could reverse the obfuscation

Respond in JSON only:
{{
  "pass": true/false,
  "leaked_entities": ["list of surviving sensitive strings"],
  "reasoning": "brief explanation"
}}"""

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text
        return json.loads(text)

    return _judge
