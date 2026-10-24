FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app
WORKDIR /app
COPY workers/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 worker
COPY workers/campus_worker /app/campus_worker
COPY workers/contracts /app/contracts
USER worker
CMD ["python", "-m", "uvicorn", "campus_worker.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
