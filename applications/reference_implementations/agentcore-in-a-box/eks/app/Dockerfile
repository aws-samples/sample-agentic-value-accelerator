# Tiny, dependency-free image for the EKS market-data service (stdlib http.server only — no pip
# install, no third-party supply-chain surface). Multi-arch friendly: the EKS nodes are amd64
# (t3.small), so build/push for linux/amd64 (see eks/build_and_push.sh --platform).
FROM python:3.12-slim

WORKDIR /app
COPY app.py /app/app.py

# Non-root for a least-privilege container.
RUN useradd -u 10001 -m appuser
USER 10001

ENV PORT=8080
EXPOSE 8080

# Simple liveness: the service answers /healthz.
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD python3 -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/healthz',timeout=2).status==200 else 1)" || exit 1

CMD ["python3", "/app/app.py"]
