# /Dockerfile
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
# 依存関係ファイルのコピー
COPY package.json pnpm-workspace.yaml ./
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY lib/ ./lib/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

# ソースコードをコピーしてビルド
COPY . .
RUN pnpm --filter @workspace/api-server run build

FROM base
WORKDIR /app
# 実行に必要なファイル群をコピー
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=build /app/lib ./lib

# 本番環境用の環境変数設定
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# artifacts/api-server/.replit-artifact/artifact.toml で指定されている本番用起動コマンド[span_2](start_span)[span_2](end_span)
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
