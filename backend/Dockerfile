FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY . .

EXPOSE 8000
# Railway / Render inject $PORT. Keep ONE worker: admin tokens, rate limiters and
# Socket.IO state live in-process. `socket_app` wraps the FastAPI app.
CMD ["sh", "-c", "uvicorn server:socket_app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --workers 1"]
