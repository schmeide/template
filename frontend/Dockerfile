# Build context is the repo root. Serves the frontend/dist that `make build` produced.
# Runs as UID 101 on port 8080 (pid and temp files under /tmp), so it passes Kubernetes `restricted` pod security.
FROM nginxinc/nginx-unprivileged:1.31-alpine
# /api/ upstream: the Compose `backend` service; a Kubernetes pod sets http://127.0.0.1:3000.
ENV API_UPSTREAM=http://backend:3000
COPY frontend/nginx.conf /etc/nginx/templates/default.conf.template
COPY frontend/dist /usr/share/nginx/html
