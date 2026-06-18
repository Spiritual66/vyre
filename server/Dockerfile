# Multi-stage: build frontend, then serve everything from the backend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --prefer-offline
COPY client/ .
# Build with production API URL pointing to the same origin (served by backend)
RUN npm run build

# --- Production image ---
FROM node:20-alpine
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
  CMD wget -qO- http://localhost:3001/api/auth || exit 1

CMD ["node", "index.js"]
