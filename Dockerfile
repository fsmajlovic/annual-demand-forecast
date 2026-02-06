# --- Build stage ---
FROM node:20-slim AS build

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Install backend dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Install UI dependencies (UI uses npm)
COPY ui/package.json ui/package-lock.json ./ui/
RUN cd ui && npm ci

# Copy source and build
COPY . .
RUN pnpm build && cd ui && pnpm build

# --- Production stage ---
FROM node:20-slim

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/ui/dist ./ui/dist

# Copy runtime files needed by the pipeline
COPY assumptions ./assumptions

EXPOSE 3001

CMD ["node", "dist/api/server.js"]
