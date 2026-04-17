FROM node:24-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --store-dir /pnpm-store

COPY apps/web ./apps/web

EXPOSE 3000

CMD ["pnpm", "--filter", "@sokrai/web", "dev", "--host", "0.0.0.0", "--port", "3000"]
