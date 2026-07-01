import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const fileName of [".env.local", ".envlocal", ".env", ".env.example"]) {
  dotenv.config({ path: path.join(backendDir, fileName), override: false });
}
