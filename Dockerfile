# ==============================================================================
# Base — shared dependencies for backend + frontend dev
# ==============================================================================
FROM node:20-bookworm AS base

# Common dev tools + native module build tools (node-pty, better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    sudo curl wget git vim nano less htop \
    procps net-tools iputils-ping dnsutils \
    jq tree tmux ssh openssh-client \
    zip unzip tar gzip \
    ca-certificates gnupg gosu \
  && rm -rf /var/lib/apt/lists/*

# Configure non-root user for terminal sessions
# (Claude Code refuses --dangerously-skip-permissions as root)
# node:20-bookworm already ships a 'node' user (uid 1000). Give it sudo + bash.
RUN usermod -s /bin/bash node \
  && echo 'node ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Entrypoint fixes volume ownership then drops to non-root user
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

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

# Ensure non-root user owns the app directory and data dir exists
RUN mkdir -p /app/data /app/backend/data && chown -R node:node /app

ENV HOST=0.0.0.0
EXPOSE 9174

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "dev:backend"]

# ==============================================================================
# Dev frontend — hot reload via Vite
# ==============================================================================
FROM base AS dev-frontend

COPY frontend/ frontend/

RUN chown -R node:node /app

ENV HOST=0.0.0.0
EXPOSE 5173

ENTRYPOINT ["docker-entrypoint.sh"]
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
FROM node:20-bookworm AS prod

# Runtime tools
RUN apt-get update && apt-get install -y \
    python3 \
    sudo curl wget git vim nano less htop \
    procps net-tools iputils-ping dnsutils \
    jq tree tmux ssh openssh-client \
    zip unzip tar gzip \
    ca-certificates gnupg gosu \
  && rm -rf /var/lib/apt/lists/*

# Configure non-root user (node:20-bookworm ships 'node' user at uid 1000)
RUN usermod -s /bin/bash node \
  && echo 'node ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

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

# Own everything
RUN mkdir -p /app/data /app/backend/data && chown -R node:node /app

ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 9174

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "backend/dist/index.js"]
