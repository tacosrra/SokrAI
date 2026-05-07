/**
 * Carga `.env` y luego `.env.test` en la raíz del repo para Vitest.
 * No usa el paquete `dotenv` (Vitest/vite puede hacer fallar la resolución del módulo).
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');

function applyEnvLines(contents: string, override: boolean): void {
  for (const raw of contents.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadIfExists(rel: string, override: boolean): void {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) return;

  applyEnvLines(fs.readFileSync(abs, 'utf8'), override);
}

loadIfExists('.env', false);
loadIfExists('.env.test', true);
