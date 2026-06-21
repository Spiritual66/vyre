# Multi-stage: build frontend, then serve everything from the backend.
# Lives at the repo root (build context = repo root) so Render's default
# Dockerfile path finds it. COPY paths are relative to the repo root.
# Debian (glibc) so @vitejs/plugin-react-swc's native binary uses the standard
# linux-x64-gnu build rather than the musl variant.
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/client
# Copy .npmrc too (legacy-peer-deps) — @emoji-mart/react's peer range predates
# React 19, so strict resolution would abort npm ci.
COPY client/package*.json client/.npmrc ./
RUN npm ci --prefer-offline --legacy-peer-deps
COPY client/ .
# Built same-origin (no VITE_API_URL) — the backend serves these files.
RUN npm run build

# --- Production image ---
FROM node:20-bookworm-slim
WORKDIR /app/server

# Build tools so better-sqlite3's native addon can compile if no prebuilt
# binary matches the platform.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install server deps
COPY server/package*.json ./
RUN npm ci --omit=dev

# Copy server source
COPY server/ .

# Copy built frontend into a location the server can serve
COPY --from=frontend-builder /app/client/dist /app/client/dist

# Uploads dir (created at runtime too, but ensure it exists)
RUN mkdir -p uploads

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
