# AI-Assisted Programming Platform for Education and Assessment

AI destekli programlama eğitim ve değerlendirme platformu.

## Proje Yapısı

```
├── frontend/              → React frontend
├── backend/               → Node.js/Express backend
├── infra/
│   ├── judge0/            → Judge0 code execution stack (ayrı compose)
│   │   ├── docker-compose.yml
│   │   ├── judge0.conf.example
│   │   └── judge0.conf        ← .gitignore'da (şifreler içerir)
│   └── scripts/           → DevOps yardımcı scriptler
│       ├── start.sh
│       ├── stop.sh
│       └── reset.sh
├── docs/                  → Proje dokümantasyonu
├── info/                  → Proje tasarım dokümanları
├── docker-compose.yml     → Ana uygulama servisleri
├── .env.example           → Environment variable şablonu
└── .env                   ← .gitignore'da (gerçek değerler)
```

## Servisler

### Ana Stack (`docker-compose.yml`)

| Servis | Port | Açıklama |
|---|---|---|
| Frontend | 5173 | React UI |
| Backend | 5000 | Node.js API |
| PostgreSQL | 5432 | Uygulama veritabanı |
| Ollama | 11434 | Local LLM runtime |
| OpenWebUI | 8080 | AI model arayüzü |

### Judge0 Stack (`infra/judge0/docker-compose.yml`)

| Servis | Port | Açıklama |
|---|---|---|
| Judge0 Server | 2358 | Code execution API |
| Judge0 Worker | — | Kod çalıştırma işçisi |
| Judge0 DB | — | Judge0'a özel PostgreSQL |
| Judge0 Redis | — | Task queue |

## Kurulum

### 1. Environment dosyalarını oluştur

```bash
# Ana uygulama
cp .env.example .env

# Judge0
cp infra/judge0/judge0.conf.example infra/judge0/judge0.conf
```

### 2. Projeyi başlat

```bash
# Tüm servisleri başlat
bash infra/scripts/start.sh
```

Veya manuel:

```bash
# Önce Judge0
docker compose -f infra/judge0/docker-compose.yml up -d

# Sonra uygulama
docker compose up --build -d
```

### 3. Projeyi durdur

```bash
bash infra/scripts/stop.sh
```

### 4. Sıfırla (tüm veriler silinir)

```bash
bash infra/scripts/reset.sh
```

## Desteklenen Diller (MVP)

C, C++, C#, Python, Java
