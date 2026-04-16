import fs from 'node:fs';
import path from 'node:path';

export function getRepoRoot(): string {
  let current = __dirname;

  while (current !== path.dirname(current)) {
    const hasWorkspace = fs.existsSync(path.join(current, 'pnpm-workspace.yaml'));
    const hasAgents = fs.existsSync(path.join(current, 'AGENTS.md'));

    if (hasWorkspace || hasAgents) {
      return current;
    }

    current = path.dirname(current);
  }

  throw new Error('Could not resolve repository root');
}

export function fromRepoRoot(...segments: string[]): string {
  return path.join(getRepoRoot(), ...segments);
}
