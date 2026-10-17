# Backend Voucher88 untuk Railway (atau hosting Docker lain).
# Tidak dipakai oleh Emergent; Emergent tetap memakai requirements.txt.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /srv/backend

COPY requirements-railway.txt .
RUN pip install --only-binary :all: -r requirements-railway.txt

COPY server.py ./
COPY static ./static

RUN useradd --create-home --uid 10001 app
USER app

# Railway mengisi PORT. HOST "::" agar bisa diakses lewat jaringan privat
# Railway (IPv6) sekaligus IPv4.
ENV HOST="::" PORT=8001
EXPOSE 8001
CMD ["sh", "-c", "exec uvicorn server:app --host \"$HOST\" --port \"$PORT\" --proxy-headers --forwarded-allow-ips='*'"]
