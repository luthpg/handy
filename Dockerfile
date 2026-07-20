FROM node:22-slim AS base

# Install system deps for node-pty native build and git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10

WORKDIR /app

# ── Dependency layer ─────────────────────────────────────────────────────────
# Copy workspace manifests first for layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/api-spec/package.json         ./lib/api-spec/
COPY lib/api-zod/package.json          ./lib/api-zod/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY artifacts/api-server/package.json ./artifacts/api-server/

# Install all workspace deps (needed for build)
RUN pnpm install --frozen-lockfile

# ── Build layer ───────────────────────────────────────────────────────────────
COPY lib/       ./lib/
COPY artifacts/api-server/ ./artifacts/api-server/

# Build the API server
RUN pnpm --filter @workspace/api-server run build

# ── Runtime layer ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 階層構造と名前を完全に維持してコピーする
# ルートの node_modules (実体が入っている場所) をそのままの階層でコピー
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json

# api-server の node_modules とビルド成果物を、本来のフォルダ階層のままコピー
COPY --from=base /app/artifacts/api-server/node_modules ./artifacts/api-server/node_modules
COPY --from=base /app/artifacts/api-server/dist         ./artifacts/api-server/dist
COPY --from=base /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

# Create workspace directory
RUN mkdir -p /app/user-workspace

# Configure git defaults
RUN git config --global init.defaultBranch main && \
    git config --global credential.helper store

EXPOSE 8080
ENV PORT=8080 \
    NODE_ENV=production

# 実行時のカレントディレクトリを api-server に移動し、そこから起動する
WORKDIR /app/artifacts/api-server
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
