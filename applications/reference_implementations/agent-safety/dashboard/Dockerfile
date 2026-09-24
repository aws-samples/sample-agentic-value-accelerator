FROM python:3.11-slim

# Patch OS packages inherited from the base image (clears the perl-base CRITICALs
# and most HIGH Debian CVEs flagged by the container image scan).
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# Upgrade Python build tooling first (clears pip / setuptools / wheel / jaraco.context CVEs).
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

COPY api.py .
COPY ava_sso.py .
COPY index.html .

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
