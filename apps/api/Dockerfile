# SPDX-FileCopyrightText: 2026 Antonio De Gaetano <antux912012@users.noreply.github.com>
# SPDX-License-Identifier: Apache-2.0

FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --frozen-lockfile --filter @imladris/shared --filter @imladris/api

COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

RUN pnpm --filter @imladris/shared build && pnpm --filter @imladris/api build

FROM node:22-slim

WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules

RUN groupadd -g 10001 imladris && useradd -u 10001 -g 10001 -m imladris \
  && mkdir -p /data/db /data/workspaces \
  && chown -R 10001:10001 /data /repo

USER 10001:10001
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/server.js"]
