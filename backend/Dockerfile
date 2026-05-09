# ── build stage ──
FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_db
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY . .
RUN npm run build \
 && npx tsc --outDir dist-seed --rootDir . --skipLibCheck --esModuleInterop prisma/seed.ts \
 && cp -r src/data dist/data

# ── production stage ──
FROM node:20-bookworm-slim

# Install Docker CLI so the backend can spawn sandboxed runner containers
# (Docker Outside of Docker — socket is bind-mounted from the host)
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      openssl \
      ca-certificates \
      curl \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && chmod a+r /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# ── App ───────────────────────────────────────────────────────────────────────
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:5000/health').then(r=>{if(!r.ok)throw r.status})" || exit 1

ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
