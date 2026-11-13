FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY marketintel ./marketintel
COPY dashboard/dist ./dashboard/dist
RUN pip install --no-cache-dir ".[postgres]"
CMD ["python", "-m", "marketintel", "serve", "0.0.0.0"]
