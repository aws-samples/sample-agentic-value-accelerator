FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
COPY src/ src/

ARG FRAMEWORK=strands
RUN pip install --no-cache-dir . ".[${FRAMEWORK}]"

ENV FRAMEWORK=${FRAMEWORK}
ENV PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "python -m src.${FRAMEWORK}.main"]
