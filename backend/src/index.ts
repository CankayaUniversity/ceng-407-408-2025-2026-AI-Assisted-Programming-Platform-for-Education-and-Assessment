import "dotenv/config";
import http from "http";
import cors from "cors";
import express from "express";
import { WebSocketServer } from "ws";
import { handleTerminalConnection } from "./ws/terminalHandler";
import { authRouter } from "./routes/auth";
import { problemsRouter } from "./routes/problems";
import { aiRouter } from "./routes/ai";
import { executeRouter } from "./routes/execute";
import { studentRouter } from "./routes/student";
import { teacherRouter } from "./routes/teacher";
import { adminRouter } from "./routes/admin";
import { variationsRouter } from "./routes/variations";
import { rubricsRouter } from "./routes/rubrics";
import { gradesRouter }       from "./routes/grades";
import { assignmentsRouter }  from "./routes/assignments";
import { liveHandler, readyHandler } from "./routes/health";
import { aiLimiter, executeLimiter } from "./middleware/rateLimiter";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "5000", 10);

const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "http://localhost:3000"];

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (Docker health checks, Postman, etc.)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
app.use("/api/ai", aiLimiter);
app.use("/api/execute", executeLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/execute", executeRouter);
app.use("/api/student", studentRouter);
app.use("/api/teacher", teacherRouter);
app.use("/api/admin", adminRouter);
app.use("/api/variations", variationsRouter);
app.use("/api/rubrics",    rubricsRouter);
app.use("/api/grades",       gradesRouter);
app.use("/api/assignments",  assignmentsRouter);

app.get("/health", liveHandler);
app.get("/api/health/live", liveHandler);
app.get("/api/health/ready", readyHandler);
app.get("/api/health", readyHandler);

// ── HTTP server ───────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

// ── WebSocket server — /ws/terminal ──────────────────────────────────────────
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws) => {
  handleTerminalConnection(ws).catch((err) => {
    console.error("[ws] unhandled error:", err);
    ws.close();
  });
});

httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url ?? "/", `http://localhost`);
  if (pathname === "/ws/terminal") {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
  warmupOllama();
});

function warmupOllama(): void {
  const ollamaBase = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? "ai-mentor";
  fetch(`${ollamaBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: "hi", stream: false, keep_alive: -1 }),
  })
    .then(() => console.log(`[warmup] Ollama model "${model}" loaded into memory`))
    .catch((err) => console.warn(`[warmup] Ollama warmup failed (will load on first request): ${err.message}`));
}

export { httpServer };