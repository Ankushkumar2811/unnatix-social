import express from "express";
import cors from "cors";
import "./config/env.js";
import { initDb } from "./db.js";
import { startScheduler } from "./scheduler.js";

import metaRoutes from "./routes/meta.js";
import linkedinRoutes from "./routes/linkedin.js";
import googleRoutes from "./routes/google.js";
import xRoutes from "./routes/x.js";
import generalRoutes from "./routes/general.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use(metaRoutes);
app.use(linkedinRoutes);
app.use(googleRoutes);
app.use(xRoutes);
app.use(generalRoutes);

app.get("/", (req, res) => {
  res.json({ status: "UnnatiX Social backend is running" });
});

const PORT = process.env.PORT || 4000;

export async function start() {
  await initDb();
  if (!process.env.VERCEL) {
    startScheduler();
  }
  app.listen(PORT, () => {
    console.log(`UnnatiX Social backend listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  start();
}

export default app;
