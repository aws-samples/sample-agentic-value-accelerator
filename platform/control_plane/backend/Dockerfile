# Build stage
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install dependencies
COPY platform/control_plane/backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    jq \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install AWS CLI v2
RUN curl -sL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip \
    && unzip -q /tmp/awscliv2.zip -d /tmp \
    && /tmp/aws/install \
    && rm -rf /tmp/awscliv2.zip /tmp/aws

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local

# Make sure scripts in .local are usable
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY platform/control_plane/backend/src/ ./src/

# JSON Schema for template metadata. Required at RUNTIME, not just by tests:
# TemplateValidator.__init__ resolves
# Path(__file__).parent.parent.parent / "schemas" / "template_metadata_schema.json"
# -> /app/schemas/template_metadata_schema.json and _load_schema() RAISES FileNotFoundError
# when it is absent. This directory was never copied, so the deployed image could not
# construct a TemplateValidator at all. Verified against the running container:
#   FileNotFoundError: Schema file not found: /app/schemas/template_metadata_schema.json
#
# That took out two reachable endpoints, because both callers build the validator
# unconditionally: bootstrap.py:47 (BootstrapEngine.__init__ -> TemplateValidator()) and
# TemplateCatalog.validate_template() (template_catalog.py:187). Template LISTING was
# unaffected - TemplateCatalog.__init__ does not build a validator - which is why this
# survived: the catalog looked healthy and only validation 500'd.
#
# It also accounted for 34 of the container suite's collection errors in
# test_bootstrap_engine.py and test_template_validator.py, which pass on a host checkout
# because ./schemas is right there. A test that only fails inside the image is easy to
# dismiss as an environment quirk; here the image was the thing that was wrong.
COPY platform/control_plane/backend/schemas/ ./schemas/

# Copy templates directory
COPY platform/control_plane/templates/ ./templates/

# Copy Agent-as-a-Service sources (Frontier Agents + registry)
COPY platform/control_plane/aaas/ ./aaas/

# Copy reference implementations
COPY applications/reference_implementations/ ./reference_implementations/

# Copy FSI Foundry foundations from the actual repo
COPY applications/fsi_foundry/foundations/ ./fsi_foundry/foundations/

# Copy FSI Foundry use case source code
COPY applications/fsi_foundry/use_cases/ ./fsi_foundry/use_cases/

# Copy FSI Foundry sample data for deployment packaging
COPY applications/fsi_foundry/data/ ./fsi_foundry/data/

# Copy FSI Foundry test scripts
COPY applications/fsi_foundry/scripts/ ./fsi_foundry/scripts/

# Copy Docker patterns for CodeBuild image builds (includes pipeline-adapted Dockerfile)
COPY applications/fsi_foundry/foundations/docker/ ./fsi_foundry/docker/

# Copy App Factory builder and UI template
COPY applications/app_factory/ ./app_factory/

# Create symlinks so scripts that reference $PROJECT_ROOT/applications/ work
RUN mkdir -p /app/applications && ln -s /app/fsi_foundry /app/applications/fsi_foundry \
    && ln -s /app/app_factory /app/applications/app_factory
# Copy FSI Foundry per-use-case UI source (for packaging into deployment zips)
COPY applications/fsi_foundry/ui/ ./fsi_foundry/ui/

# Set Python path to find modules
ENV PYTHONPATH=/app/src
# Foundry use-case registry — evaluation auto-enrollment scaffolds suites from it
ENV FOUNDRY_REGISTRY_PATH=/app/fsi_foundry/data/registry/offerings.json

# Set templates path environment variable
ENV TEMPLATES_PATH=/app/templates
ENV REFERENCE_IMPLEMENTATIONS_DIR=/app/reference_implementations

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/ping || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
