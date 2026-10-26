# Aneka 88 Voucher dalam SATU service (frontend + backend) untuk Railway.
# Dipakai otomatis lewat /railway.json. Tidak dipakai oleh Emergent.
#
# Variabel wajib di Railway: MONGO_URL (${{MongoDB.MONGO_URL}}) dan ADMIN_PASSWORD.
# Lainnya otomatis: PORT dari Railway, DB_NAME=voucher88, JWT secret dibuat
# sendiri dan disimpan di database, email nonaktif, tanpa CORS (satu domain).

FROM node:20-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/yarn.lock ./
# @emergentbase/visual-edits hanya untuk mode dev Emergent dan diunduh dari server
# Emergent; dilepas di sini agar build tidak bergantung pada Emergent.
RUN node -e 'const f="package.json",p=require("./"+f);delete p.devDependencies["@emergentbase/visual-edits"];require("fs").writeFileSync(f,JSON.stringify(p,null,2))' \
 && yarn install --non-interactive --network-timeout 120000
COPY frontend/ ./
ENV REACT_APP_BACKEND_URL="" \
    REACT_APP_DISABLE_EMERGENT_SCRIPTS="true" \
    CI=false \
    GENERATE_SOURCEMAP=false
RUN yarn build

FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /srv/backend
COPY backend/requirements-railway.txt .
RUN pip install --only-binary :all: -r requirements-railway.txt
COPY backend/server.py ./
COPY backend/static ./static
COPY --from=frontend /src/build /srv/frontend
RUN useradd --create-home --uid 10001 app
USER app

# HOST kosong = IPv4 + IPv6. Railway mengisi PORT.
ENV HOST="" PORT=8000 FRONTEND_BUILD_DIR=/srv/frontend
EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn server:app --host \"$HOST\" --port \"$PORT\" --proxy-headers --forwarded-allow-ips='*'"]
