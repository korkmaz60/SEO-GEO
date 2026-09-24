// Creates .env from .env.example and fills the empty secrets with random values.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = new URL("../.env", import.meta.url);
if (existsSync(target)) {
  console.log(".env already exists; nothing was changed.");
  process.exit(0);
}

let content = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
for (const name of ["AUTH_SECRET", "ENCRYPTION_KEY"]) {
  content = content.replace(
    new RegExp(`^${name}=$`, "m"),
    `${name}=${randomBytes(32).toString("base64")}`,
  );
}
writeFileSync(target, content, { mode: 0o600 });
console.log("Created .env with a new AUTH_SECRET and ENCRYPTION_KEY.");
