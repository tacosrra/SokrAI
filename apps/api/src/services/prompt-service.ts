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
  'solution-definition-agent': 'solution-definition-agent.md',
  'data-ai-privacy-gap-agent': 'data-ai-privacy-gap-agent.md',
  'medical-device-triage-agent': 'medical-device-triage-agent.md',
  'resources-pilot-viability-agent': 'resources-pilot-viability-agent.md',
} as const;

const LANGUAGE_POLICY_PROMPT = 'language-policy';

const PROMPTS_WITHOUT_LANGUAGE_POLICY = new Set<keyof typeof PROMPT_FILES>(['json-repair']);

async function readPromptFile(version: string, fileName: string): Promise<string> {
  const filePath = fromRepoRoot('prompts', version, fileName);
  return fs.readFile(filePath, 'utf8');
}

async function composePromptContent(
  name: keyof typeof PROMPT_FILES,
  version: string,
): Promise<string> {
  const content = await readPromptFile(version, PROMPT_FILES[name]);

  if (PROMPTS_WITHOUT_LANGUAGE_POLICY.has(name)) {
    return content;
  }

  const languagePolicy = await readPromptFile(version, `${LANGUAGE_POLICY_PROMPT}.md`);

  return [content.trimEnd(), '', languagePolicy.trimEnd()].join('\n');
}

export async function loadPrompt(
  name: keyof typeof PROMPT_FILES,
  version = 'v1',
): Promise<PromptAsset> {
  const content = await composePromptContent(name, version);

  return {
    name,
    version,
    content,
    hash: sha256(content),
  };
}
