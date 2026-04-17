FROM node:24-alpine AS base

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile --store-dir /pnpm-store

COPY apps/api ./apps/api
COPY contracts ./contracts
COPY prompts ./prompts
COPY db ./db

RUN pnpm --filter @sokrai/api build && test -f /app/apps/api/dist/index.js

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
