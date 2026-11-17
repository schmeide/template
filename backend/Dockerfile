# Build context is the repo root: the npm workspace lockfile lives there.
# Node runs the TypeScript sources directly (type stripping), so there is no compile step.
FROM node:26.13.1-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --omit=dev

FROM node:26.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app ./
COPY backend/src backend/src
COPY backend/drizzle backend/drizzle
# Numeric (node) so Kubernetes can verify runAsNonRoot.
USER 1000
WORKDIR /app/backend
EXPOSE 3000
CMD ["node", "src/server.ts"]
