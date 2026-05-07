import { describe, expect, it } from 'vitest';

import { resolveProblemDefinitionPromptName } from '../../apps/api/src/services/prompt-service.ts';

describe('resolveProblemDefinitionPromptName', () => {
  it('returns the default prompt for specialty = default', () => {
    expect(resolveProblemDefinitionPromptName('default')).toBe('problem-definition-agent');
  });

  it('returns the legal prompt for specialty = legal', () => {
    expect(resolveProblemDefinitionPromptName('legal')).toBe('problem-definition-agent-legal');
  });

  it('returns the default prompt when specialty is null', () => {
    expect(resolveProblemDefinitionPromptName(null)).toBe('problem-definition-agent');
  });

  it('returns the default prompt when specialty is undefined', () => {
    expect(resolveProblemDefinitionPromptName(undefined)).toBe('problem-definition-agent');
  });

  it('returns the default prompt when called with no arguments', () => {
    expect(resolveProblemDefinitionPromptName()).toBe('problem-definition-agent');
  });
});
