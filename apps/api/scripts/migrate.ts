import fs from 'node:fs/promises';
import path from 'node:path';

import { loadConfig } from '../src/config/env';
import { Database } from '../src/repositories/database';
import { fromRepoRoot } from '../src/utils/paths';

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config);

  try {
    const migrationsDir = fromRepoRoot('db', 'migrations');
    const entries = await fs.readdir(migrationsDir);
    const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = await fs.readFile(fullPath, 'utf8');
      await database.query(sql);
      console.log(`Applied migration: ${file}`);
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
