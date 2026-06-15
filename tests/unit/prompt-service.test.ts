import { describe, expect, it } from 'vitest';

import { loadPrompt } from '../../apps/api/src/services/prompt-service.ts';

describe('loadPrompt language policy', () => {
  it('appends the shared language policy to conversational prompts', async () => {
    const prompt = await loadPrompt('problem-definition-agent');

    expect(prompt.content).toContain('Prompt: problem-definition-agent@v1');
    expect(prompt.content).toContain('# Language policy');
    expect(prompt.content).toContain('Never switch to English or another language');
  });

  it('does not append the language policy to json repair prompts', async () => {
    const prompt = await loadPrompt('json-repair');

    expect(prompt.content).toContain('Prompt: json-repair@v1');
    expect(prompt.content).not.toContain('# Language policy');
  });
});
