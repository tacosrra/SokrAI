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

describe('toast notification motion', () => {
  it('slides notifications in from above and out upward', () => {
    const toast = getRule('.toast-notification');
    const leavingToast = getRule('.toast-notification--leaving');

    expect(toast).toMatch(/animation:\s*toast-slide-in\b/);
    expect(leavingToast).toMatch(/animation:\s*toast-slide-out\b/);
    expect(styles).toMatch(/@keyframes toast-slide-in[\s\S]*translate\(-50%, -32px\)/);
    expect(styles).toMatch(/@keyframes toast-slide-out[\s\S]*translate\(-50%, -28px\)/);
  });
});

describe('gap checklist layout', () => {
  it('keeps gap cards sized to content instead of stretching to fill the panel', () => {
    const checklist = getRule('.gap-checklist');

    expect(checklist).toMatch(/align-content:\s*start/);
    expect(checklist).toMatch(/align-items:\s*start/);
  });
});
