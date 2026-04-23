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

# Copy templates directory
COPY platform/control_plane/templates/ ./templates/

# Copy FSI Foundry registry (copied to build context before docker build)
COPY platform/control_plane/backend/data/ ./data/

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

# Create symlink so scripts that reference $PROJECT_ROOT/applications/fsi_foundry/ work
RUN mkdir -p /app/applications && ln -s /app/fsi_foundry /app/applications/fsi_foundry
# Copy FSI Foundry per-use-case UI source (for packaging into deployment zips)
COPY applications/fsi_foundry/ui/ ./fsi_foundry/ui/

# Set Python path to find modules
ENV PYTHONPATH=/app/src

# Set templates path environment variable
ENV TEMPLATES_PATH=/app/templates

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/ping || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
