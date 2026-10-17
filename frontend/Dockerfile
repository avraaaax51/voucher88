# Frontend Voucher88 untuk Railway (atau hosting Docker lain).
# Tidak dipakai oleh Emergent. Hasil build React disajikan oleh Caddy, yang juga
# meneruskan /api/* ke service backend lewat jaringan privat, sehingga browser
# hanya melihat satu domain (cookie login tetap first-party).

FROM node:20-alpine AS build
WORKDIR /src
COPY package.json yarn.lock ./
# @emergentbase/visual-edits hanya untuk mode dev Emergent dan diunduh dari
# server Emergent; dilepas di image ini agar build tidak bergantung pada Emergent.
RUN node -e 'const f="package.json",p=require("./"+f);delete p.devDependencies["@emergentbase/visual-edits"];require("fs").writeFileSync(f,JSON.stringify(p,null,2))' \
 && yarn install --non-interactive --network-timeout 120000
COPY . .
# Kosong = panggil API di domain yang sama (/api/...), diteruskan oleh Caddy.
ARG REACT_APP_BACKEND_URL=""
ARG REACT_APP_DISABLE_EMERGENT_SCRIPTS="true"
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL \
    REACT_APP_DISABLE_EMERGENT_SCRIPTS=$REACT_APP_DISABLE_EMERGENT_SCRIPTS \
    CI=false \
    GENERATE_SOURCEMAP=false
RUN yarn build

FROM caddy:2.8-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/build /srv
ENV PORT=8080
EXPOSE 8080
