# ADR 0020 — Missions deploy through pocket-cloud's deploy script, with bot-cut releases

- **Status:** Accepted
- **Date:** 2026-11-27
- **Related:** ADR 0016, ADR 0018, ADR 0019; spec 036; [the vision](../../mission-control.md)
- **Approved by:** the owner's grilling of 2026-11-27 (flight rules, section 2)

## TL;DR

A merged mission on a planet at **missions** goes on to production by itself. Pocket Comms, as the
mission bot, pushes the planet's next release tags, computed from the conventional commits since
the last tags; waits for their release workflows; and runs pocket-cloud's `scripts/deploy.sh`,
which deploys, checks health and rolls back by itself. A migration or a breaking change waits for
the owner's **Deploy**; a rolled-back deploy pauses the planet and opens an issue.

## Context

Step 3 (ADR 0019) ends a mission at the merge, and a release tag was the owner's decision on
every planet. pocket-cloud is the only place that knows how the home server runs each app: stacks
pinned to a release version in `.env`, and native parts (comms, lens) built by their install
scripts, comms' with a health check and a rollback already. The mission's agent is gone once its
pull request is merged, and the agents' deny list refuses pushing tags.

## Decision

- **Who.** Pocket Comms' server runs the release and the deploy after the merge, not the agent.
  It pushes tags through Gitea's API as the mission bot.
- **The recipe.** pocket-cloud owns one uniform script, `scripts/deploy.sh <app> <version>`: pin
  the version in `.env`, deploy, wait for healthy containers, probe the app's health URL, and on
  failure pin, deploy and check the previous version again. `deploy.sh check <app>` tells whether
  an app can deploy without changing anything. Comms reads the script's path from
  `COMMS_DEPLOY_SCRIPT` and its result from a JSON file, so deploying comms itself survives the
  restart it causes.
- **Releases.** A planet names its releases (tag prefix, paths, release workflow, deploy app) and
  migration paths in a `json mission-control` block of its `AGENTS.md`. The bot cuts every release
  as conventional commits say: `feat` minor, `fix` and `perf` patch, nothing else ships. Tags stay
  the only deployed versions, comms' and lens' included.
- **Missions mean deploy.** There is no separate switch: a planet at **missions** deploys when its
  deploy checks pass, and its missions end **merged, not deployed** when they do not.
- **Stops.** A breaking change or a migration among the shipped commits waits for the owner's
  Deploy, which backs up first; the mission queue goes on meanwhile, and the planet's later missions wait
  with it. A rolled-back deploy pauses the planet (preflight's last-deploy check) until its "fix
  the failed deploy" issue is closed. Master is never reverted on its own.
- **The design kit** is published by its release tag like any release, without the deploy script;
  the apps are not bumped on their own.

## Consequences

- The flight rules' stop "a release outside the planet's deploy recipe" stays: the recipe now
  includes the bot-cut release. Planets whose docs called a release tag the owner's decision now
  allow the bot's.
- A night of missions reaches production without the owner, one mission deployed at a time.
- The comms server runs Docker against the pocket-cloud VM through the script; the agents still
  cannot (their deny list is unchanged).
- A wrong conventional-commit type ships the wrong version; the commit gates already enforce the
  types.

## Alternatives considered

- **The agent deploys:** it would have to outlive its merge and needs the deny list loosened.
- **A recipe in comms' planet settings:** a second place that knows deploys, next to pocket-cloud.
- **Deploying commits instead of tags:** no versions in `.env` and the log, and the stacks' images
  are built from tags.
- **A separate deploy switch per planet:** the owner chose to let **missions** mean deploy.
- **Reverting master after a rollback:** the owner keeps that decision.
