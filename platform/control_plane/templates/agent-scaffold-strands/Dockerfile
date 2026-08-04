FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY src/ src/

EXPOSE 8080

CMD ["python", "-m", "src.main"]
