# ${PROJECT_NAME} - Strands Agent Container
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Set Python path
ENV PYTHONPATH=/app

# Run the agent
CMD ["python", "-m", "src.hello_agent"]
