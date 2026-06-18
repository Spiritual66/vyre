# Multi-stage: build frontend, then serve everything from the backend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --prefer-offline
COPY client/ .
# Build with production API URL pointing to the same origin (served by backend)
RUN npm run build

# --- Production image ---
# Debian slim (glibc) so better-sqlite3 uses its prebuilt binary instead of
# needing a source build (which musl/alpine would require).
FROM node:20-bookworm-slim
WORKDIR /app/server

# Install server deps
COPY server/package*.json ./
RUN npm ci --prefer-offline --omit=dev

# Copy server source
COPY server/ .

# Copy built frontend into a location the server can serve
COPY --from=frontend-builder /app/client/dist ../client/dist

# Uploads volume mount point
RUN mkdir -p uploads

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
