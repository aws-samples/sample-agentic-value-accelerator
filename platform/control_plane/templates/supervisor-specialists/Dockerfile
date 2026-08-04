FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .

ARG FRAMEWORK=strands
RUN pip install --no-cache-dir ".[$FRAMEWORK]"

COPY src/${FRAMEWORK} ./src/agent

ENV PORT=8080
EXPOSE 8080

CMD ["python", "-m", "src.agent.main"]
