import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRouter } from "./routes/auth";
import { problemsRouter } from "./routes/problems";
import { aiRouter } from "./routes/ai";
import { executeRouter } from "./routes/execute";
import { liveHandler, readyHandler } from "./routes/health";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "5000", 10);

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api/auth", authRouter);
app.use("/api/problems", problemsRouter);
app.use("/api/ai", aiRouter);
app.use("/api/execute", executeRouter);

app.get("/health", liveHandler);
app.get("/api/health/live", liveHandler);
app.get("/api/health/ready", readyHandler);
app.get("/api/health", readyHandler);

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});