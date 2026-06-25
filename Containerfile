#
# PatternFly MCP server — container image definition.
#
# Multi-stage build. Produces a minimal Node.js 24 runtime image that
# launches the MCP server as a stdio process; HTTP transport is
# available by passing `--http --port <n>` at `podman run` time (the
# `ENTRYPOINT` forwards all arguments verbatim to the CLI).
#
# Base image: UBI 9 Node.js 24 minimal.
#   - Anonymous pull from `registry.access.redhat.com` (no login required).
#   - glibc-based, rootless-friendly, sets `APP_ROOT=/opt/app-root` and a
#     default non-root user at UID 1001.
#
#
# ---- Stage 1: builder ---------------------------------------------------
# Installs deps, compiles the bundle with pkgroll, and prunes dev deps so
# only the runtime payload moves into stage 2.
FROM registry.access.redhat.com/ubi9/nodejs-24-minimal:latest AS builder

# Non-root build/runtime user. Matches the UBI base default; exposed as an
# ARG so downstream tooling can override without editing the file.
ARG CONTAINER_UID=1001
ENV CONTAINER_UID=${CONTAINER_UID}

# UBI defines `APP_ROOT=/opt/app-root`; reuse it so paths line up with the
# base image's conventions.
WORKDIR ${APP_ROOT}

# Copy only the files needed to resolve deps first.
COPY --chown=${CONTAINER_UID}:0 package.json package-lock.json tsconfig.json ./

USER ${CONTAINER_UID}

# Lockfile-exact install.
RUN npm ci --ignore-scripts --no-audit --no-fund

# Copy the rest of the source and produce the bundle.
COPY --chown=${CONTAINER_UID}:0 src ./src
RUN npx --no-install pkgroll --minify \
 && npm prune --omit=dev --ignore-scripts

# ---- Stage 2: runtime ---------------------------------------------------
# Minimal runtime image. Only the compiled bundle, pruned `node_modules`,
# and `package.json` are carried over from the builder stage.
FROM registry.access.redhat.com/ubi9/nodejs-24-minimal:latest AS runtime

# Standard OCI annotations
LABEL org.opencontainers.image.title="patternfly-mcp" \
      org.opencontainers.image.description="PatternFly documentation MCP server (Node.js 24)" \
      org.opencontainers.image.source="https://github.com/patternfly/patternfly-mcp" \
      org.opencontainers.image.url="https://github.com/patternfly/patternfly-mcp" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.vendor="Red Hat" \
      io.modelcontextprotocol.transport="stdio"

# Re-declare the build arg in this stage. ARGs do not cross stages.
ARG CONTAINER_UID=1001
ENV CONTAINER_UID=${CONTAINER_UID}

# Runtime environment defaults:
#   - `NODE_ENV=production`           enables production code paths in deps
#   - `NPM_CONFIG_UPDATE_NOTIFIER`    suppress npm self-update nags
#   - `NO_COLOR`                      keep stderr/stdout machine-readable
#                                     (MCP clients consume these streams)
ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NO_COLOR=1

WORKDIR ${APP_ROOT}

# Runtime payload
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/package.json   ${APP_ROOT}/package.json
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/node_modules   ${APP_ROOT}/node_modules
COPY --from=builder --chown=${CONTAINER_UID}:0 ${APP_ROOT}/dist           ${APP_ROOT}/dist

USER ${CONTAINER_UID}

# stdio MCP server by default. Clients attach over stdin/stdout. `CMD`
# provides only a default flag set; anything passed after the image name
# on `podman run ... <image> <flags>` replaces `CMD` entirely, so every
# CLI option (including `--http --port <n>` for HTTP transport) works
# without rebuilding the image.
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--log-stderr"]
