FROM node:24-alpine AS base

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json

RUN pnpm install --frozen-lockfile --store-dir /pnpm-store --prod=false

COPY . .

RUN pnpm build

EXPOSE 3001

CMD ["pnpm", "start"]
