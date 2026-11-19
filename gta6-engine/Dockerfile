# Dashboard/API container (Render free web service, Koyeb, any Docker host)
FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-inter fontconfig && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m app && mkdir -p /tmp/gta6media && chown -R app /app /tmp/gta6media
USER app
ENV MEDIA_DIR=/tmp/gta6media PORT=10000
EXPOSE 10000
HEALTHCHECK CMD python -c "import os,urllib.request;urllib.request.urlopen(f\"http://localhost:{os.environ['PORT']}/health\")"
CMD uvicorn app.api:app --host 0.0.0.0 --port ${PORT}
