# Static image: nginx serving the console, plus the one runtime dependency.
#
# Lucide is fetched in a build stage so node and npm never reach the final
# image — only dist/umd/lucide.min.js does, at the same path index.html asks
# for. Everything else the app needs is a file in this repo.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
WORKDIR /usr/share/nginx/html
COPY index.html favicon.ico logo.webp ./
COPY css ./css
COPY js ./js
COPY --from=deps /app/node_modules/lucide/dist/umd/lucide.min.js \
                 ./node_modules/lucide/dist/umd/lucide.min.js

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q --spider http://localhost/ || exit 1
