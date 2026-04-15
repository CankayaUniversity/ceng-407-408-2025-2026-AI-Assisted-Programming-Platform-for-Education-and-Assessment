# ── build stage ──
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Empty = relative /api (nginx proxies to backend). Override only if needed.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# ── production stage ──
FROM nginx:stable-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# wget yoksa healthcheck sürekli fail olur; curl ile güvenilir kontrol
RUN apk add --no-cache curl

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=5 \
  CMD curl -fsS http://127.0.0.1/ >/dev/null || exit 1