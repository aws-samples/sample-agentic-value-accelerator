FROM python:3.11-slim

RUN useradd -u 1000 -m agentcore

RUN pip install --no-cache-dir \
    "mcp[cli]>=1.23.0" \
    "boto3>=1.34.0" \
    "pydantic>=2.10.0"

WORKDIR /app
COPY src/ src/
COPY server.py .

USER 1000
EXPOSE 8000

CMD ["python", "server.py"]
