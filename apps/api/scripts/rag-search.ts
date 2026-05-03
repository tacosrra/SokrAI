import { loadConfig } from '../src/config/env';
import { buildRagModule } from '../src/rag';
import { Database } from '../src/repositories/database';
import { JsonLogger } from '../src/utils/logger';

interface ParsedArgs {
  pack: string | null;
  query: string | null;
  k: number | null;
  language: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { pack: null, query: null, k: null, language: null, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--pack') {
      args.pack = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--pack=')) {
      args.pack = arg.slice('--pack='.length);
    } else if (arg === '--query' || arg === '-q') {
      args.query = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--query=')) {
      args.query = arg.slice('--query='.length);
    } else if (arg === '--k') {
      args.k = Number(argv[i + 1] ?? 'NaN');
      i += 1;
    } else if (arg.startsWith('--k=')) {
      args.k = Number(arg.slice('--k='.length));
    } else if (arg === '--language') {
      args.language = argv[i + 1] ?? null;
      i += 1;
    } else if (arg.startsWith('--language=')) {
      args.language = arg.slice('--language='.length);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(
    [
      'Usage: pnpm rag:search --pack <name> --query "<text>" [--k 8] [--language es]',
      '',
      'Options:',
      '  --pack <name>      Pack to search in (can be repeated with comma-separated values)',
      '  --query, -q "..."  Query text',
      '  --k <int>          Top-K (default: RAG_DEFAULT_TOP_K)',
      '  --language <code>  Optional language filter (e.g. "es", "ca", "en")',
      '  --help, -h         Show this help message',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.pack || !args.query) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const config = loadConfig();
  const logger = new JsonLogger(config.logLevel);
  const database = new Database(config);

  try {
    const rag = buildRagModule({ config, database, logger });

    const packs = (args.pack ?? '')
      .split(',')
      .map((segment) => segment.trim())
      .filter(Boolean);

    const result = await rag.retrieval.retrieve({
      query: args.query as string,
      packs,
      topK: args.k && Number.isFinite(args.k) ? args.k : undefined,
      filters: args.language ? { language: args.language } : undefined,
      requester: 'cli_search',
    });

    console.log(`\nRetrieval ${result.retrievalId}`);
    console.log(`  packs:        ${packs.join(', ')}`);
    console.log(`  embedding:    ${result.embeddingProvider} / ${result.embeddingModel}`);
    console.log(`  latency:      ${result.latencyMs} ms`);
    console.log(`  chunks:       ${result.chunks.length}`);
    console.log('');

    if (result.chunks.length === 0) {
      console.log('No results.');
      return;
    }

    result.chunks.forEach((chunk, index) => {
      const id = `S${index + 1}`;
      const titleParts: string[] = [chunk.documentTitle];
      if (chunk.sectionPath) titleParts.push(chunk.sectionPath);

      console.log(`[${id}] score=${chunk.score.toFixed(4)}  ${titleParts.join(' \u00b7 ')}`);
      console.log(indent(chunk.content, '    '));
      console.log('');
    });
  } finally {
    await database.close();
  }
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
