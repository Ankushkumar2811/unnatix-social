import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.VERCEL
  ? path.join("/tmp", "unnatix-social-db.json")
  : path.join(__dirname, "data", "db.json");

const defaultData = {
  accounts: [],   // { id, platform, name, accessToken, refreshToken, expiresAt, meta }
  posts: [],       // { id, platform, accountId, content, mediaUrl, scheduledFor, status, result }
  pendingConnections: []
};

const adapter = new JSONFile(file);
export const db = new Low(adapter, defaultData);

export async function initDb() {
  await db.read();
  db.data ||= defaultData;
  db.data.accounts ||= [];
  db.data.posts ||= [];
  db.data.pendingConnections ||= [];
  await db.write();
}
