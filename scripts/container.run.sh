#!/usr/bin/env bash
# Run the PatternFly MCP container image locally as a stdio MCP server.
# podman is the primary, supported runtime; Docker is detected as a
# fallback only if podman is not installed.
#
# All arguments passed to this script are forwarded verbatim to the CLI
# inside the container, so every flag (`--verbose`, `--http`, `--port`,
# `--tool`, ...) works without rebuilding the image.
#
# Runtime posture (hardened by default):
#   - `--rm`                          remove the container on exit
#   - `-i` (no `-t`)                  REQUIRED for stdio MCP; do NOT add `-t`
#   - `--userns=keep-id`              map the container user to the host
#                                     user (`podman` specific)
#   - `--security-opt=no-new-privileges`  block privilege escalation
#   - `--cap-drop=ALL`                drop all Linux capabilities
#   - `--read-only`                   read-only rootfs (server writes nothing
#                                     outside `/tmp`)
#   - `--tmpfs /tmp:rw,size=64m`      writable, size-capped tmpfs for `/tmp`
#
# Usage:
#   ./scripts/container.run.sh [<cli flags>]
#   IMAGE=localhost/patternfly-mcp:latest ./scripts/container.run.sh --verbose --log-stderr
#
# Note:
#   Since `--userns=keep-id` is `podman` specific, for compatibility with
#   Docker, we leverage an env value `export PODMAN_USERNS=keep-id`.
#
# Environment:
#   IMAGE  Fully qualified image reference (with tag). Defaults to
#          `localhost/patternfly-mcp:latest`.
#
# main()
#
{
  # Fail fast on errors, unset variables, and broken pipes.
  set -euo pipefail

  # Resolve the image reference. Caller can override via the IMAGE env var
  # to run a specific tag (e.g. `:sha-<short>` or `:<semver>`).
  IMAGE="${IMAGE:-localhost/patternfly-mcp:latest}"
  ENGINE=""

  # Prefer podman. Docker is supported but intentionally not advertised; if
  # neither runtime is available, fail with a clear error.
  if [ "$(command -v podman)" ]; then
    ENGINE="podman"
    export PODMAN_USERNS="keep-id"
  elif [ "$(command -v docker)" ]; then
    ENGINE="docker"
  else
    echo 'Error: podman and Docker not found.' >&2
    exit 1
  fi

  echo "Using $ENGINE...";

  # `exec` replaces the shell so signals (SIGINT/SIGTERM from the MCP client)
  # are delivered directly to the container runtime, which forwards them to
  # the server process for a clean shutdown.
  exec "$ENGINE" run --rm -i \
    --security-opt=no-new-privileges \
    --cap-drop=ALL \
    --read-only \
    --tmpfs /tmp:rw,size=64m \
    "${IMAGE}" "$@"
}
