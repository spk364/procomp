# ProComp Makefile
.PHONY: help install dev build clean lint type-check test format db-setup db-migrate db-generate web api ui

# Default target
.DEFAULT_GOAL := help

# Colors for output
BLUE := \033[36m
GREEN := \033[32m
YELLOW := \033[33m
RED := \033[31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)ProComp Development Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "$(GREEN)%-20s$(NC) %s\n", $$1, $$2}'

# Installation
install: ## Install all dependencies
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	pnpm install

# Development
dev: ## Start all applications in development mode
	@echo "$(YELLOW)Starting development servers...$(NC)"
	pnpm dev

web: ## Start only web application
	@echo "$(YELLOW)Starting web application...$(NC)"
	cd apps/web && pnpm dev

api: ## Start only API server
	@echo "$(YELLOW)Starting API server...$(NC)"
	cd apps/api && python -m uvicorn app.main:app --reload

ui: ## Start UI package in watch mode
	@echo "$(YELLOW)Starting UI package in watch mode...$(NC)"
	cd packages/ui && pnpm dev

# Building
build: ## Build all packages and applications
	@echo "$(YELLOW)Building all packages...$(NC)"
	pnpm build

build-web: ## Build web application only
	@echo "$(YELLOW)Building web application...$(NC)"
	cd apps/web && pnpm build

build-ui: ## Build UI package only
	@echo "$(YELLOW)Building UI package...$(NC)"
	cd packages/ui && pnpm build

# Quality Assurance
lint: ## Run linting on all packages
	@echo "$(YELLOW)Running linters...$(NC)"
	pnpm lint

type-check: ## Run TypeScript type checking
	@echo "$(YELLOW)Running type checking...$(NC)"
	pnpm type-check

test: ## Run all tests
	@echo "$(YELLOW)Running tests...$(NC)"
	pnpm test

format: ## Format code with Prettier
	@echo "$(YELLOW)Formatting code...$(NC)"
	pnpm format

format-check: ## Check code formatting
	@echo "$(YELLOW)Checking code formatting...$(NC)"
	pnpm format:check

# Database
db-generate: ## Generate Prisma client
	@echo "$(YELLOW)Generating Prisma client...$(NC)"
	pnpm db:generate

db-push: ## Push database schema changes
	@echo "$(YELLOW)Pushing database schema...$(NC)"
	pnpm db:push

db-migrate: ## Run database migrations
	@echo "$(YELLOW)Running database migrations...$(NC)"
	pnpm db:migrate

# Cleanup
clean: ## Clean all build artifacts and node_modules
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	pnpm clean
	find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true

clean-cache: ## Clean package manager cache
	@echo "$(YELLOW)Cleaning pnpm cache...$(NC)"
	pnpm store prune

# Docker commands (if needed)
docker-build: ## Build Docker containers
	@echo "$(YELLOW)Building Docker containers...$(NC)"
	docker-compose build

docker-up: ## Start Docker containers
	@echo "$(YELLOW)Starting Docker containers...$(NC)"
	docker-compose up -d

docker-down: ## Stop Docker containers
	@echo "$(YELLOW)Stopping Docker containers...$(NC)"
	docker-compose down

docker-logs: ## Show Docker logs
	@echo "$(YELLOW)Showing Docker logs...$(NC)"
	docker-compose logs -f

# Quick setup for new developers
setup: install db-generate build ## Full setup for new developers
	@echo "$(GREEN)✅ Project setup complete!$(NC)"
	@echo "$(BLUE)Run 'make dev' to start development servers$(NC)"

# Production deployment
deploy-staging: ## Deploy to staging environment
	@echo "$(YELLOW)Deploying to staging...$(NC)"
	# Add your staging deployment commands here

deploy-prod: ## Deploy to production environment
	@echo "$(RED)Deploying to production...$(NC)"
	# Add your production deployment commands here

# Status check
status: ## Show status of all services
	@echo "$(BLUE)Project Status:$(NC)"
	@echo "$(GREEN)Web:$(NC) http://localhost:3000"
	@echo "$(GREEN)API:$(NC) http://localhost:8000"
	@echo "$(GREEN)API Docs:$(NC) http://localhost:8000/docs"

# Aliases for convenience
i: install ## Alias for install
d: dev ## Alias for dev
b: build ## Alias for build
l: lint ## Alias for lint
t: test ## Alias for test
tc: type-check ## Alias for type-check 