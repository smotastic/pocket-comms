#!/usr/bin/env bash
# Exits non-zero when the second OpenAPI document breaks clients of the first one.
set -euo pipefail

IMAGE="tufin/oasdiff:v1.32.1@sha256:3b14fe0112e5d1bf862f91ab234a4bcd161a3f399e98f8b0b665ce70857694ac"

# The documents are copied into the container instead of bind-mounted: in CI the Docker daemon
# can sit outside the job container (Gitea Actions shares the host's socket), where a bind-mount
# path does not exist.
container="$(docker create "$IMAGE" breaking /base.json /revision.json --fail-on ERR)"
trap 'docker rm --force "$container" >/dev/null' EXIT
docker cp --quiet "$1" "$container:/base.json"
docker cp --quiet "$2" "$container:/revision.json"
docker start --attach "$container"
