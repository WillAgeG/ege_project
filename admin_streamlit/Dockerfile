FROM python:3.13-slim

WORKDIR /app

RUN groupadd --gid 10001 vektor \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin vektor \
    && chown -R vektor:vektor /app

COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=vektor:vektor . /app/admin_streamlit
COPY --chown=vektor:vektor .streamlit /app/.streamlit

USER vektor

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app \
    ADMIN_API_BASE_URL=http://app:8000

EXPOSE 8501

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health', timeout=3)"]

CMD ["python", "-m", "streamlit", "run", "admin_streamlit/app.py", "--server.headless=true", "--server.address=0.0.0.0", "--server.port=8501", "--server.enableCORS=false", "--server.enableXsrfProtection=true"]
