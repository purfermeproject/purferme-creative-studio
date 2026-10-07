// Fails if anything secret-looking ends up in the client bundle (.next/static).
// Run after `npm run build`: `npm run check:bundle`.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = ".next/static";
const SECRET_ENV = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "AUTH_SECRET", "DATABASE_URL", "AUTH_GOOGLE_SECRET", "AUTH_RESEND_KEY", "BLOB_READ_WRITE_TOKEN", "SUPABASE_SERVICE_ROLE_KEY"];
const patterns = [
  ...SECRET_ENV.map((name) => ({ label: `env var name ${name}`, test: (s) => s.includes(name) })),
  { label: "Anthropic key (sk-ant-)", test: (s) => /sk-ant-[A-Za-z0-9_-]{10,}/.test(s) },
  { label: "Postgres connection string", test: (s) => /postgres(ql)?:\/\/[^"'\s]*@/.test(s) },
  { label: "@anthropic-ai/sdk in client code", test: (s) => s.includes("anthropic-version") },
  { label: "OpenAI key (sk-proj-)", test: (s) => /sk-proj-[A-Za-z0-9_-]{10,}/.test(s) },
  // Actual secret values from the build environment, when present.
  ...SECRET_ENV.filter((n) => (process.env[n] ?? "").length >= 12).map((n) => ({
    label: `value of ${n}`,
    test: (s) => s.includes(process.env[n]),
  })),
];

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(root).filter((f) => /\.(js|css|json|map)$/.test(f));
} catch {
  console.error(`No ${root} found. Run \`npm run build\` first.`);
  process.exit(1);
}

const problems = [];
for (const f of files) {
  const s = readFileSync(f, "utf8");
  for (const p of patterns) if (p.test(s)) problems.push(`${f}: ${p.label}`);
}
if (problems.length) {
  console.error("Secrets found in the client bundle:\n" + problems.join("\n"));
  process.exit(1);
}
console.log(`Bundle check passed: ${files.length} client files, no secrets or server-only SDKs.`);
