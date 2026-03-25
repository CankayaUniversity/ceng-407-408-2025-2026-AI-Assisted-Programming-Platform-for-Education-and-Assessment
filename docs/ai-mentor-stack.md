# AI mentor stack

The product docs describe an **AI mentor** (hints, no full solutions) backed by **Ollama** and optionally **Open WebUI** as a separate operator UI.

## Current implementation

| Piece | Location |
|-------|----------|
| HTTP API | `backend/src/routes/ai.ts` — `POST /api/ai/chat` |
| Prompting, guards, Ollama client | `backend/src/services/mentor.ts` |
| Model packaging for `ollama create` | `model/Modelfile` (root of repo: `model/`) |

The legacy **Python** helper under `model/ai_module.py` has been **removed**; behavior now lives in TypeScript as above.

## Environment

- `OLLAMA_BASE_URL` — e.g. `http://ollama:11434` in Docker, `http://localhost:11434` locally.
- `OLLAMA_MODEL` — name of the created model (default `ai-mentor`), built from `model/Modelfile` where configured.

Open WebUI is **not** required for the platform API; it only helps humans talk to the same Ollama instance during development.
