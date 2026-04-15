.PHONY: help deploy deploy-infra deploy-foundations deploy-app-infra deploy-webapp destroy update-env port-forward outputs clean

# Default environment
ENV ?= dev
# Auto-approve flag (set to any value to enable, e.g., APPROVE=1)
APPROVE ?=

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

# Build auto-approve flag if APPROVE is set
AUTO_APPROVE_FLAG := $(if $(APPROVE),--auto-approve,)

help: ## Show this help message
	@echo "$(BLUE)Market Surveillance Portal Deployment Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Usage:$(NC)"
	@echo "  make [target] [ENV=dev|staging|prod] [APPROVE=1]"
	@echo ""
	@echo "$(GREEN)Available targets:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""
	@echo "$(GREEN)Examples:$(NC)"
	@echo "  make deploy ENV=dev              # Deploy full stack to dev"
	@echo "  make deploy-infra APPROVE=1      # Deploy infra with auto-approve"
	@echo "  make deploy-webapp ENV=prod      # Deploy webapp to prod"
	@echo "  make destroy ENV=dev             # Destroy dev environment"

deploy: ## Deploy full stack (infrastructure + webapp)
	@echo "$(BLUE)Deploying full stack to $(ENV)...$(NC)"
	@scripts/deploy-backend.sh --environment $(ENV) $(AUTO_APPROVE_FLAG)
	@scripts/deploy-webapp-ec2.sh --environment $(ENV)

deploy-infra: ## Deploy infrastructure (foundations + app-infra)
	@echo "$(BLUE)Deploying infrastructure to $(ENV)...$(NC)"
	@scripts/deploy-backend.sh --environment $(ENV) $(AUTO_APPROVE_FLAG)

deploy-foundations: ## Deploy foundations only
	@echo "$(BLUE)Deploying foundations to $(ENV)...$(NC)"
	@scripts/deploy-backend.sh --environment $(ENV) --foundation-only $(AUTO_APPROVE_FLAG)

deploy-app-infra: ## Deploy app-infra only (requires foundations)
	@echo "$(BLUE)Deploying app-infra to $(ENV)...$(NC)"
	@scripts/deploy-backend.sh --environment $(ENV) --app-infra-only $(AUTO_APPROVE_FLAG)

deploy-webapp: ## Deploy webapp using Docker
	@echo "$(BLUE)Deploying webapp to $(ENV)...$(NC)"
	@scripts/deploy-webapp-ec2.sh --environment $(ENV)

destroy: ## Destroy infrastructure
	@echo "$(YELLOW)WARNING: This will destroy all infrastructure in $(ENV)$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		scripts/deploy-backend.sh --environment $(ENV) --destroy --auto-approve; \
	else \
		echo "Aborted."; \
	fi

update-env: ## Update frontend .env.local for local development
	@echo "$(BLUE)Updating frontend environment variables...$(NC)"
	@scripts/update-frontend-env.sh

port-forward: ## Start Aurora database port forwarding
	@echo "$(BLUE)Starting Aurora port forwarding...$(NC)"
	@scripts/aurora-port-forward.sh

port-forward-risk: ## Start Risk Analyst Aurora database port forwarding
	@echo "$(BLUE)Starting Risk Analyst Aurora port forwarding...$(NC)"
	@scripts/aurora-port-forward-risk.sh

outputs: ## Show Terraform outputs
	@echo "$(BLUE)Foundations Outputs:$(NC)"
	@terraform -chdir=infrastructure/foundations output
	@echo ""
	@echo "$(BLUE)App-Infra Outputs:$(NC)"
	@terraform -chdir=infrastructure/app-infra output

clean: ## Clean local build artifacts
	@echo "$(BLUE)Cleaning build artifacts...$(NC)"
	@rm -rf trade-alerts-app/.next
	@rm -rf trade-alerts-app/node_modules
	@rm -rf agent-backend/__pycache__
	@rm -rf agent-backend/.venv
	@echo "$(GREEN)Clean complete$(NC)"
