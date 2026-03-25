FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
# Prisma 7 reads DATABASE_URL from env while loading prisma.config.ts (no DB connection needed for generate).
ARG DATABASE_URL=postgresql://postgres:postgres@postgres:5432/app_db
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate

COPY . .

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh && chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 5000

ENV NODE_ENV=development

ENTRYPOINT ["sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]
