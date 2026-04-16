import type { ProblemDefinitionState, StructuredBrief } from '../contracts/types';

export interface NormalizedSourceText {
  rawText: string;
  normalizedText: string;
  warnings: string[];
}

function cleanWhitespace(input: string): string {
  return input
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function mergeSourceText(
  proposalText: string | undefined,
  documentText: string | undefined,
  maxChars: number,
): NormalizedSourceText {
  const sections: string[] = [];
  const warnings: string[] = [];

  if (proposalText?.trim()) {
    sections.push(`Proposal text:\n${proposalText.trim()}`);
  }

  if (documentText?.trim()) {
    sections.push(`Document text:\n${documentText.trim()}`);
  }

  const rawText = sections.join('\n\n');
  let normalizedText = cleanWhitespace(rawText);

  if (normalizedText.length > maxChars) {
    normalizedText = normalizedText.slice(0, maxChars);
    warnings.push(`Input was truncated to ${maxChars} characters`);
  }

  return {
    rawText,
    normalizedText,
    warnings,
  };
}

export function toProblemDefinitionState(brief: StructuredBrief): ProblemDefinitionState {
  return {
    problem_owner: brief.problem_owner,
    problem_statement: brief.problem_statement,
    evidence_of_problem: brief.evidence_of_problem,
    scope: brief.scope,
    current_alternatives: brief.current_alternatives,
    assumptions: [...brief.assumptions],
    ambiguities_remaining: [...brief.ambiguities],
  };
}

export function deriveDetectedGaps(brief: StructuredBrief): string[] {
  return Array.from(new Set([...brief.ambiguities, ...brief.missing_information]));
}
