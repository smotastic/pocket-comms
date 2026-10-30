#!/usr/bin/env python3
"""Validate that the ci-success gatekeeper job depends on every other job.

Branch protection on `master` requires only the single `ci-success` status
check (see docs/engineering/git-and-pr-conventions.md). That job fans in
all other jobs via `needs`.
This script fails loudly if a job was added/removed without keeping that
`needs` list in sync, so a forgotten update breaks CI instead of silently
letting `ci-success` pass without waiting for the new job.
"""
import sys
from pathlib import Path

import yaml

WORKFLOW_PATH = Path(__file__).resolve().parent.parent / ".github" / "workflows" / "ci.yml"
GATEKEEPER_JOB = "ci-success"


def main() -> int:
    workflow = yaml.safe_load(WORKFLOW_PATH.read_text())
    jobs = workflow.get("jobs", {})

    if GATEKEEPER_JOB not in jobs:
        print(f"::error::Gatekeeper job '{GATEKEEPER_JOB}' not found in {WORKFLOW_PATH}")
        return 1

    needs = jobs[GATEKEEPER_JOB].get("needs", [])
    if isinstance(needs, str):
        needs = [needs]
    needs = set(needs)

    all_other_jobs = set(jobs) - {GATEKEEPER_JOB}
    missing = all_other_jobs - needs
    stale = needs - all_other_jobs

    if missing:
        print(
            "::error::'"
            f"{GATEKEEPER_JOB}.needs' is missing job(s): {sorted(missing)}. "
            f"Add them to the 'needs' list in {WORKFLOW_PATH.relative_to(WORKFLOW_PATH.parent.parent.parent)} "
            "so the gatekeeper waits for them."
        )
    if stale:
        print(
            f"::error::'{GATEKEEPER_JOB}.needs' references job(s) that no longer exist: "
            f"{sorted(stale)}. Remove them from the 'needs' list."
        )

    if missing or stale:
        return 1

    print(f"OK: '{GATEKEEPER_JOB}.needs' matches all {len(all_other_jobs)} other jobs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
