# ==============================================================================
# Base — shared dependencies for backend + frontend dev
# ==============================================================================
FROM node:20-bookworm AS base

# Native module build tools (node-pty, better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files for all workspaces
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/

RUN npm ci

# Copy shared types (needed at startup, rarely changes)
COPY shared/ shared/

# ==============================================================================
# Dev backend — hot reload via tsx watch
# ==============================================================================
FROM base AS dev-backend

COPY backend/src/ backend/src/
COPY backend/tsconfig.json backend/

ENV HOST=0.0.0.0
EXPOSE 9174

CMD ["npm", "run", "dev:backend"]

# ==============================================================================
# Dev frontend — hot reload via Vite
# ==============================================================================
FROM base AS dev-frontend

COPY frontend/ frontend/

ENV HOST=0.0.0.0
EXPOSE 5173

CMD ["npm", "run", "dev:frontend"]

# ==============================================================================
# Build target — compile everything
# ==============================================================================
FROM base AS build

COPY . .

RUN npm run build

# ==============================================================================
# Production target — minimal runtime
# ==============================================================================
FROM node:20-bookworm-slim AS prod

# Runtime dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY shared/package.json shared/

# Copy node_modules from build (includes compiled native modules)
COPY --from=build /app/node_modules/ node_modules/
COPY --from=build /app/backend/node_modules/ backend/node_modules/

# Copy built artifacts
COPY --from=build /app/backend/dist/ backend/dist/
COPY --from=build /app/frontend/dist/ frontend/dist/
COPY --from=build /app/shared/ shared/

ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 9174

CMD ["node", "backend/dist/index.js"]
