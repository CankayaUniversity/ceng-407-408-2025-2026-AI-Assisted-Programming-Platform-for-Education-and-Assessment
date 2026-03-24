import "dotenv/config";
import cors from "cors";
import express from "express";

const app = express();
const port = Number.parseInt(process.env.PORT ?? "5000", 10);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${port}`);
});
