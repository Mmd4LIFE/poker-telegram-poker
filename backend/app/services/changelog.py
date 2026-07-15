"""Parse the root CHANGELOG.md (Keep a Changelog format) into structured releases.

Single source of truth: the frontend renders whatever this returns, so a release is
added in ONE place — CHANGELOG.md — not here and not in the app. Parsing is defensive:
a malformed line is skipped, never fatal.
"""
from __future__ import annotations

import os
import re

# CHANGELOG.md is mounted at /app in the container; fall back to the repo root in dev.
_CANDIDATES = [
    "/app/CHANGELOG.md",
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "CHANGELOG.md"),
    os.path.join(os.path.dirname(__file__), "..", "..", "CHANGELOG.md"),
]

# "## [0.9.0] - 2026-07-15 - Skill & Decision Quality"
_H2 = re.compile(r"^##\s+\[([^\]]+)\]\s*(?:[-–—]\s*([0-9]{4}-[0-9]{2}-[0-9]{2}))?\s*(?:[-–—]\s*(.*))?$")
_H3 = re.compile(r"^###\s+(.+?)\s*$")
_LI = re.compile(r"^[-*]\s+(.*)$")

# Keep-a-Changelog section -> the player-facing tag the UI uses for icon/accent
_TAG = {
    "added": "new",
    "changed": "improved",
    "fixed": "fixed",
    "removed": "fixed",
    "deprecated": "fixed",
    "security": "fixed",
}


def _find_file() -> str | None:
    for p in _CANDIDATES:
        if os.path.isfile(p):
            return p
    return None


def _strip_md(text: str) -> str:
    """Flatten inline markdown to plain text for the app (bold, code, links)."""
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)   # links -> label
    text = re.sub(r"[*_`]+", "", text)                      # bold/italic/code marks
    return text.strip()


def load() -> dict:
    path = _find_file()
    if not path:
        return {"releases": [], "error": "changelog not found"}

    with open(path, encoding="utf-8") as fh:
        lines = fh.readlines()

    releases: list[dict] = []
    cur: dict | None = None
    section: str | None = None

    for raw in lines:
        line = raw.rstrip("\n")

        m2 = _H2.match(line)
        if m2:
            version, date, title = m2.group(1), m2.group(2), m2.group(3)
            # skip the reference-link footer lines like "[0.9.0]: https://..."
            cur = {
                "version": version.strip(),
                "date": (date or "").strip(),
                "title": _strip_md(title or ""),
                "changes": [],
            }
            releases.append(cur)
            section = None
            continue

        if cur is None:
            continue

        m3 = _H3.match(line)
        if m3:
            section = m3.group(1).strip().lower()
            continue

        mli = _LI.match(line.strip())
        if mli and section is not None:
            cur["changes"].append(
                {"tag": _TAG.get(section, "new"), "text": _strip_md(mli.group(1))}
            )

    # drop empty shells (e.g. an "Unreleased" with nothing under it) and the link footer
    releases = [r for r in releases if r["changes"]]
    return {"releases": releases}
