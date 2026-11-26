FROM python:3.13-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 vektor \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin vektor \
    && mkdir -p /data \
    && chown -R vektor:vektor /app /data

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=vektor:vektor ux-ui ./ux-ui
COPY --chown=vektor:vektor frontend ./frontend
COPY --chown=vektor:vektor backend ./backend
COPY --chown=vektor:vektor databases ./databases
COPY --chown=vektor:vektor alembic.ini ./alembic.ini

USER vektor

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    WEB_CONCURRENCY=2 \
    FORWARDED_ALLOW_IPS="127.0.0.1,10.0.0.0/8,100.64.0.0/10,172.16.0.0/12,192.168.0.0/16"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\", \"8000\")}/api/health', timeout=3)"]

# Мультиворкерный режим безопасен: BackgroundScheduler берёт pg_try_advisory_lock, RealtimeBroker использует PG LISTEN/NOTIFY.
CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2} --proxy-headers --forwarded-allow-ips \"${FORWARDED_ALLOW_IPS}\""]
