#!/bin/bash
set -e
echo "⚠️  Bu komut tüm volume'ları silecek (veritabanı verileri dahil)!"
read -p "Devam etmek istiyor musunuz? (y/N): " confirm

if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
  echo "Stopping and removing all data..."
  docker compose down -v
  docker compose -f infra/judge0/docker-compose.yml down -v

  echo "Rebuilding..."
  docker compose -f infra/judge0/docker-compose.yml up -d
  docker compose up --build -d

  echo "Reset complete."
else
  echo "İptal edildi."
fi