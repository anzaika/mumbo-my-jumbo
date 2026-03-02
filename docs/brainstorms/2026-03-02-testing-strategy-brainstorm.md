# Testing Strategy for Mumbo My Jumbo

**Date:** 2026-03-02
**Status:** Draft
**Scope:** End-to-end testing strategy for the file obfuscation skill

## What We're Building

A layered test suite (test pyramid) that validates the mumbo-my-jumbo skill catches all sensitive entities and produces structurally equivalent output. Three layers:

1. **Unit tests** — Fast pytest tests for `scripts/generate_sed.py` covering sed escaping, longest-first ordering, edge cases, and JSON input parsing. Zero dependencies, instant feedback.

2. **Integration tests** — Apply generated sed commands to fixture markdown files, then grep for surviving entities against an answer key. Validates the sed pipeline without invoking any LLM agents.

3. **E2E tests** — Run the full skill on generated fixture documents (detection → sed → verification → rewrite). Verify output with both deterministic answer-key grep and an LLM judge pass. Run on-demand due to API cost.

## Why This Approach

- **Primary concern is missed entities** — sensitive names/URLs/keys surviving into the shared output. This is the highest-stakes failure mode since the skill's purpose is preventing data leaks.
- **Test pyramid gives cost-appropriate coverage** — free unit tests run always, expensive E2E runs on-demand before releases or after significant changes.
- **Two-layer E2E verification** (grep + LLM judge) catches both known entities from the answer key and emergent leaks the answer key doesn't cover.
- **Golden fixtures** (generated once, reused forever) provide stable regression baselines.

## Key Decisions

1. **Approach: Test Pyramid** — Unit + Integration + E2E layers, not E2E-only or contract-only. Balances fast feedback with holistic confidence.

2. **Fixtures: Generate once, reuse always** — Create a corpus of realistic markdown documents with a known entity manifest. These serve as the ground-truth test suite.

3. **E2E verification: Two layers** — Deterministic grep against the answer key (did known entities survive?) plus an LLM judge pass (are there sensitive-looking entities the answer key missed?).

4. **Cost management: Layered execution** — Unit tests run instantly with no API calls. Integration tests run sed locally. E2E tests invoke agents and run on-demand.

## Resolved Questions

1. **Fixture corpus size and diversity** — Medium comprehensive set of 8-12 documents. Cover each entity category (companies, people, URLs/emails, API keys/secrets, internal tools, IPs) plus edge cases: overlapping entities, case variations, entities in code blocks, dense documents.

2. **LLM judge implementation** — Judge receives full context: original document, obfuscated output, and the replacement map. This lets it verify replacements were applied correctly AND check for leaks. More precise than blind-reading the output alone.

3. **Test runner and structure** — All tests in a `tests/` directory using pytest. Use `@pytest.mark.slow` to separate unit/integration (fast) from E2E (slow/expensive). Run fast tests with `pytest -m "not slow"`, full suite with `pytest`.

4. **CI integration** — Local only. This is a Claude Code skill, not a deployed service. Tests run manually.

5. **Failure diagnostics** — Keep it simple. When an E2E test fails, the answer-key grep tells you which entity survived — manually inspect the output file to trace back to the cause. No structured logging or index preservation needed.
