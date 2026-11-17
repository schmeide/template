# Build context is the repo root: the npm workspace lockfile lives there.
# The build stage bundles the frontend, so the image needs nothing built beforehand.
FROM node:26.13.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci
COPY . .
RUN npm run build -w frontend

# Runs as UID 101 on port 8080 (pid and temp files under /tmp), so it passes Kubernetes `restricted` pod security.
FROM nginxinc/nginx-unprivileged:1.31-alpine
# /api/ upstream: the Compose `backend` service; a Kubernetes pod sets http://127.0.0.1:3000.
ENV API_UPSTREAM=http://backend:3000
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/frontend/dist /usr/share/nginx/html
