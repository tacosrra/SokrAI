import fs from 'node:fs/promises';

import { sha256 } from '../utils/hash';
import { fromRepoRoot } from '../utils/paths';

export interface PromptAsset {
  name: string;
  version: string;
  content: string;
  hash: string;
}

const PROMPT_FILES = {
  'extract-initial-brief': 'extract-initial-brief.md',
  'json-repair': 'json-repair.md',
  'problem-definition-agent': 'problem-definition-agent.md',
} as const;

export async function loadPrompt(
  name: keyof typeof PROMPT_FILES,
  version = 'v1',
): Promise<PromptAsset> {
  const fileName = PROMPT_FILES[name];
  const filePath = fromRepoRoot('prompts', version, fileName);
  const content = await fs.readFile(filePath, 'utf8');

  return {
    name,
    version,
    content,
    hash: sha256(content),
  };
}
