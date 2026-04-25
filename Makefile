.PHONY: dev dev-open build preview test test-watch lint typecheck format check \
       docker-build docker-run clean install prepare help \
       seed-claims seed-claims-dry

# ─── Development ──────────────────────────────────────────────────────

dev: ## Start SvelteKit dev server
	pnpm run dev

dev-open: ## Start dev server and open in browser
	pnpm run dev -- --open

preview: ## Preview production build locally
	pnpm run preview

# ─── Quality ──────────────────────────────────────────────────────────

lint: ## Run ESLint
	pnpm run lint

typecheck: ## Run svelte-check type checker
	pnpm run typecheck

format: ## Format code with Prettier
	pnpm run format

test: ## Run tests with coverage
	pnpm run test

test-watch: ## Run tests in watch mode
	pnpm vitest --watch

check: lint typecheck test build ## Run all quality checks (lint → typecheck → test → build)

# ─── Build ────────────────────────────────────────────────────────────

build: ## Build for production
	pnpm run build

# ─── Docker ───────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	docker build -t architect-of-suspicion .

docker-run: ## Run Docker container with .env file
	docker run -p 8080:8080 --env-file .env architect-of-suspicion

# ─── Setup ────────────────────────────────────────────────────────────

install: ## Install dependencies
	pnpm install

prepare: ## Run SvelteKit sync
	pnpm run prepare

# ─── Lighthouse ───────────────────────────────────────────────────────

lhci-desktop: build ## Run Lighthouse CI desktop preset locally (perf>=90, a11y/bp/seo=100)
	pnpm dlx @lhci/cli@0.15.x autorun --config=lighthouserc.json

lhci-mobile: build ## Run Lighthouse CI mobile preset locally (perf>=75)
	pnpm dlx @lhci/cli@0.15.x autorun --config=lighthouserc.mobile.json

# ─── Claim Engine ─────────────────────────────────────────────────────

seed-claims: ## Run the claim engine pipeline (writes to Supabase)
	pnpm run seed-claims

seed-claims-dry: ## Run the claim engine pipeline, print results only
	CLAIM_ENGINE_DRY_RUN=true pnpm run seed-claims

# ─── Cleanup ──────────────────────────────────────────────────────────

clean: ## Remove build artifacts and dependencies
	rm -rf node_modules .svelte-kit build coverage

# ─── Help ─────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:[^#]*## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":[^#]*## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
