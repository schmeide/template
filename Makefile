SHELL := /usr/bin/env
.SHELLFLAGS = bash -e -o pipefail -c
.DEFAULT_GOAL := help
.NOTPARALLEL:
.SILENT:
.ONESHELL:

ifndef VERBOSE
MAKEFLAGS += --no-print-directory
endif

ifneq (,$(wildcard ./.env))
	include .env
	export
endif

JS_EXEC ?= npm
JS_INSTALL ?= install

# Host ports. `make up` publishes only WEB_PORT (default 8080, set in compose.yaml).
# COMPOSE_PROJECT_NAME (default: the directory name) scopes containers and volumes.
DB_PORT ?= 5432
TEST_DB_PORT ?= 5433
PORT ?= 3000
VITE_PORT ?= 5173
export DB_PORT TEST_DB_PORT PORT VITE_PORT

DATABASE_URL ?= postgres://postgres:postgres@localhost:$(DB_PORT)/app
TEST_DATABASE_URL ?= postgres://postgres:postgres@localhost:$(TEST_DB_PORT)/app
export DATABASE_URL

NODE_VERSION := $(shell cat .nvmrc 2>/dev/null)
NVM_DIR ?= $(HOME)/.nvm

# A non-interactive SSH shell never sources nvm.sh, so `node` is off PATH even
# when nvm installed it. Fall back to the nvm directory: the version in .nvmrc
# first, then the newest one present.
NODE_BIN ?= $(shell { \
	command -v node 2>/dev/null || true; \
	ls -1 $(NVM_DIR)/versions/node/v$(NODE_VERSION)*/bin/node 2>/dev/null | sort -V | tail -1 || true; \
	ls -1 $(NVM_DIR)/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1 || true; \
	} | head -1)

ifneq (,$(NODE_BIN))
export PATH := $(patsubst %/,%,$(dir $(NODE_BIN))):$(PATH)
endif

##@ Development Environment

.PHONY: setup
setup: setup/js ## Set up development environment

.PHONY: setup/js
setup/js: ## Install Node.js via nvm and project dependencies
	if ! [ -s "$$HOME/.nvm/nvm.sh" ]; then \
		curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash; \
	fi
	. $$HOME/.nvm/nvm.sh
	nvm install
	$(JS_EXEC) $(JS_INSTALL)

.PHONY: serve
serve: docker/check node_modules ## Hot reload: Postgres on DB_PORT, tsx watch on PORT, Vite on VITE_PORT
	docker compose --profile serve up -d --wait dev-db
	$(MAKE) db/migrate
	echo "App: http://localhost:$(VITE_PORT) (Postgres keeps running; 'make down' stops it)"
	$(JS_EXEC) run dev

.PHONY: up
up: docker/check build ## Build and (re)start the full stack on WEB_PORT (default 8080), migrating in-stack
	docker compose up -d --build --wait --remove-orphans
	echo "App: http://localhost:$${WEB_PORT:-8080} ('make down' stops it)"

.PHONY: down
down: docker/check ## Stop every Compose service in this project (volumes are kept)
	docker compose --profile '*' down

##@ Database

.PHONY: db/migrate
db/migrate: node_modules ## Apply migrations in backend/drizzle to $DATABASE_URL
	$(JS_EXEC) run db:migrate -w backend

.PHONY: db/generate
db/generate: node_modules ## Generate a migration from the schema (NAME=create_widgets to name it)
	$(JS_EXEC) run db:generate -w backend $(if $(NAME),-- --name $(NAME))
	$(JS_EXEC) exec prettier -- --write backend/drizzle >/dev/null

##@ Build

.PHONY: build
build: node_modules ## Typecheck everything and bundle the frontend into frontend/dist
	$(JS_EXEC) run build

.PHONY: clean
clean: ## Clean build artifacts
	rm -rf \
		./frontend/dist \
		./coverage \
		./node_modules/.vite \
		./node_modules/.tmp

##@ Testing

# A TEST_DATABASE_URL from the environment (a build pod's Postgres sidecar) is used as is, without Docker.
.PHONY: test
ifeq ($(origin TEST_DATABASE_URL),environment)
test: node_modules ## Run tests once against a throwaway Compose Postgres, or an exported TEST_DATABASE_URL
	$(MAKE) test/run DATABASE_URL=$(TEST_DATABASE_URL)
else
test: docker/check node_modules ## Run tests once against a throwaway Compose Postgres, or an exported TEST_DATABASE_URL
	trap 'docker compose --profile test down test-db >/dev/null 2>&1' EXIT
	docker compose --profile test up -d --wait test-db
	$(MAKE) test/run DATABASE_URL=$(TEST_DATABASE_URL)
endif

.PHONY: test/watch
test/watch: docker/check node_modules ## Run tests in watch mode against a throwaway Compose Postgres
	trap 'docker compose --profile test down test-db >/dev/null 2>&1' EXIT
	docker compose --profile test up -d --wait test-db
	$(MAKE) db/migrate DATABASE_URL=$(TEST_DATABASE_URL)
	DATABASE_URL=$(TEST_DATABASE_URL) $(JS_EXEC) run test:watch

.PHONY: test/run
test/run: node_modules ## Migrate and test against an existing $DATABASE_URL (no Docker)
	$(MAKE) db/migrate
	$(JS_EXEC) run test

##@ Dependencies

.PHONY: deps
deps: ## Install dependencies
	$(JS_EXEC) $(JS_INSTALL)

.PHONY: upgrade
upgrade: upgrade/ts ## Upgrade all dependencies

.PHONY: upgrade/ts
upgrade/ts: node_modules ## Upgrade npm dependencies
	$(JS_EXEC) run check-updates
	$(JS_EXEC) $(JS_INSTALL)

##@ Code Quality

.PHONY: check
check: check/ts ## Check code quality

.PHONY: check/ts
check/ts: node_modules ## Check code quality (eslint, tsc, prettier, markdown)
	$(JS_EXEC) run lint

.PHONY: lint
lint: lint/ts ## Lint codebase

.PHONY: lint/ts
lint/ts: node_modules ## Lint TypeScript and React code
	$(JS_EXEC) run lint

.PHONY: format
format: format/ts ## Format code

.PHONY: format/ts
format/ts: node_modules ## Format code (Prettier)
	$(JS_EXEC) run fix:prettier

.PHONY: fix
fix: fix/ts ## Fix lint and format errors

.PHONY: fix/ts
fix/ts: node_modules ## Fix lint and format errors
	$(JS_EXEC) run fix

# Shape targets exist only in the template itself, while shapes/ is present.
-include shapes/shape.mk

##@ Helpers

# Installs dependencies only when node_modules is missing.
node_modules:
	$(JS_EXEC) $(JS_INSTALL)

.PHONY: docker/check
docker/check:
	if ! command -v docker >/dev/null 2>&1; then \
		echo "Error: docker not found. Install Docker Desktop (https://docs.docker.com/get-docker/) and retry."; \
		exit 1; \
	fi
	if ! docker info >/dev/null 2>&1; then \
		echo "Error: the Docker daemon is not running. Start Docker Desktop (or your Docker daemon) and retry."; \
		exit 1; \
	fi

env-%: ## Check if env var is defined
	if [ -z "$($*)" ]; then \
		echo "Error: Environment variable '$*' is not set."; \
		exit 1; \
	fi

.PHONY: help
help: ## Display this help
	awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_\/-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
