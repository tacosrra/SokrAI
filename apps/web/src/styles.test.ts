import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function getRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`));

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match.groups.body;
}

describe('top navigation positioning', () => {
  it('keeps the app and workspace headers in normal document flow', () => {
    const appTopbar = getRule('.app-topbar');
    const workspaceTopbar = getRule('.workspace-topbar');

    expect(appTopbar).not.toMatch(/position:\s*(sticky|fixed)\b/);
    expect(workspaceTopbar).not.toMatch(/position:\s*(sticky|fixed)\b/);
  });
});
