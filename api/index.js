import app from "../backend/server.js";
import { initDb } from "../backend/db.js";

const ready = initDb();

export default async function handler(req, res) {
  await ready;
  return app(req, res);
}
