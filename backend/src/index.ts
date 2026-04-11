import "dotenv/config";
import http from "http";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { problemsRouter } from "./routes/problems";
import { aiRouter } from "./routes/ai";
import { executeRouter } from "./routes/execute";
import { studentRouter } from "./routes/student";
import { teacherRouter } from "./routes/teacher";
import { adminRouter } from "./routes/admin";
import { variationsRouter } from "./routes/variations";
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

app.get("/health", liveHandler);
app.get("/api/health/live", liveHandler);
app.get("/api/health/ready", readyHandler);
app.get("/api/health", readyHandler);

// ── HTTP server (required for WebSocket upgrade later in Phase 6) ─────────────
const httpServer = http.createServer(app);

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});

export { httpServer };