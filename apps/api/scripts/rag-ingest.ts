import { loadConfig } from '../src/config/env';
import { buildRagModule } from '../src/rag';
import { Database } from '../src/repositories/database';
import { JsonLogger } from '../src/utils/logger';

interface ParsedArgs {
  pack: string | null;
  all: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { pack: null, all: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--all') {
      args.all = true;
    } else if (arg === '--pack') {
      const next = argv[i + 1];
      if (!next) {
        throw new Error('--pack requires a value');
      }
      args.pack = next;
      i += 1;
    } else if (arg.startsWith('--pack=')) {
      args.pack = arg.slice('--pack='.length);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: pnpm rag:ingest --pack <name>',
      '       pnpm rag:ingest --all',
      '',
      'Options:',
      '  --pack <name>   Ingest a specific pack from the configured RAG_PACKS_DIR',
      '  --all           Ingest every pack found in RAG_PACKS_DIR',
      '  --help, -h      Show this help message',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.pack && !args.all)) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const config = loadConfig();
  const logger = new JsonLogger(config.logLevel);
  const database = new Database(config);

  try {
    const rag = buildRagModule({ config, database, logger });
    const packsToIngest = args.all
      ? await rag.manifestLoader.listPackNames()
      : [args.pack as string];

    if (packsToIngest.length === 0) {
      console.log('No packs found to ingest.');
      return;
    }

    let exitCode = 0;

    for (const packName of packsToIngest) {
      console.log(`\n=== Ingesting pack: ${packName} ===`);
      try {
        const report = await rag.ingestion.ingestPack(packName);
        printReport(report);

        const failed = report.files.filter((file) => file.status === 'failed');
        if (failed.length > 0) {
          exitCode = 2;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        console.error(`Failed to ingest pack '${packName}': ${message}`);
        exitCode = 1;
      }
    }

    process.exitCode = exitCode;
  } finally {
    await database.close();
  }
}

function printReport(report: import('../src/rag').IngestionReport): void {
  const counts = { added: 0, updated: 0, skipped: 0, failed: 0 };
  for (const file of report.files) {
    counts[file.status] += 1;
  }

  console.log(`Embedding model:  ${report.embeddingModel}`);
  console.log(`Files processed:  ${report.files.length}`);
  console.log(`  added:    ${counts.added}`);
  console.log(`  updated:  ${counts.updated}`);
  console.log(`  skipped:  ${counts.skipped}`);
  console.log(`  failed:   ${counts.failed}`);
  console.log(`Chunks inserted:  ${report.totalChunksInserted}`);

  for (const file of report.files) {
    const summary = file.status === 'failed'
      ? `FAIL  ${file.sourcePath}  -> ${file.errorMessage ?? 'unknown error'}`
      : `${file.status.toUpperCase().padEnd(7)} ${file.sourcePath}  (${file.chunksInserted ?? 0} chunks${
          file.charCount ? `, ${file.charCount} chars` : ''
        })`;
    console.log(`  ${summary}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
