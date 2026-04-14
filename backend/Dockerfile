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
 && npx tsc --outDir dist-seed --rootDir . --skipLibCheck --esModuleInterop prisma/seed.ts

# ── .NET SDK stage (for C# interactive terminal) ──
FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS dotnet-sdk

# ── production stage ──
FROM node:20-bookworm-slim

# System runtimes for interactive terminal
RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      openssl \
      python3 \
      gcc \
      g++ \
      coreutils \
    && rm -rf /var/lib/apt/lists/*

# ── .NET SDK (C# support) ────────────────────────────────────────────────────
COPY --from=dotnet-sdk /usr/share/dotnet /usr/share/dotnet
RUN ln -sf /usr/share/dotnet/dotnet /usr/local/bin/dotnet

ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    DOTNET_NOLOGO=1 \
    DOTNET_EnableDiagnostics=0 \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

# Pre-warm MSBuild/NuGet cache — avoids slow first compile when a student runs C#
RUN mkdir -p /tmp/cs-warmup && \
    printf '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings></PropertyGroup></Project>' \
      > /tmp/cs-warmup/app.csproj && \
    echo 'Console.WriteLine("ok");' > /tmp/cs-warmup/Program.cs && \
    dotnet run --project /tmp/cs-warmup --nologo && \
    rm -rf /tmp/cs-warmup

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
