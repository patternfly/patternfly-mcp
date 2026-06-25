#!/usr/bin/env bash
# Build the PatternFly MCP container image locally from the repository's
# Containerfile. Podman is the primary, supported runtime; Docker is
# detected as a fallback only if Podman is not installed.
#
# Produces four tags under the `${IMAGE}` repository:
#   - ${IMAGE}:<semver>           (from package.json#version)
#   - ${IMAGE}:<semver>-node24    (Node.js 24 base image identifier)
#   - ${IMAGE}:sha-<git short>    (current HEAD short SHA, or `dev` outside git)
#   - ${IMAGE}:latest
#
# Usage:
#   ./scripts/container.build.sh
#   IMAGE=localhost/patternfly-mcp ./scripts/container.build.sh
#
# Environment:
#   IMAGE  Image repository (without tag). Defaults to `localhost/patternfly-mcp`.
#
# main()
#
{
  # Fail fast on errors, unset variables, and broken pipes.
  set -euo pipefail

  # Derive tag metadata from package.json and git. `SHA` falls back to `dev`
  # when invoked outside a git checkout (e.g. extracted tarball).
  VERSION="$(node -p "require('./package.json').version")"
  SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"
  IMAGE="${IMAGE:-localhost/patternfly-mcp}"
  ENGINE=""

  # Prefer podman. Docker is supported but intentionally not advertised; if
  # neither runtime is available, fail with a clear error.
  if [ "$(command -v podman)" ]; then
    ENGINE="podman"
  elif [ "$(command -v docker)" ]; then
    ENGINE="docker"
  else
    echo 'Error: Podman and Docker not found.' >&2
    exit 1
  fi

  echo "Using $ENGINE...";

  # Build with all four tags applied in a single pass so the layer cache is
  # shared and the tags are guaranteed to reference the same image digest.
  "$ENGINE" build \
    --file Containerfile \
    --tag "${IMAGE}:${VERSION}" \
    --tag "${IMAGE}:${VERSION}-node24" \
    --tag "${IMAGE}:sha-${SHA}" \
    --tag "${IMAGE}:latest" \
    .

  # Echo the resulting tag set so callers (and CI logs) can see exactly what
  # was produced without re-running `podman images`.
  echo
  echo "Built tags:"
  echo "  ${IMAGE}:${VERSION}"
  echo "  ${IMAGE}:${VERSION}-node24"
  echo "  ${IMAGE}:sha-${SHA}"
  echo "  ${IMAGE}:latest"
}
