import { afterEach, describe, expect, it, vi } from 'vitest';

import { saveBlobDownload } from './download';

const originalDocument = globalThis.document;
const originalWindow = (globalThis as { window?: unknown }).window;
const originalURL = globalThis.URL;

function stubGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

describe('saveBlobDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();

    if (originalDocument === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      stubGlobal('document', originalDocument);
    }

    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      stubGlobal('window', originalWindow);
    }

    stubGlobal('URL', originalURL);
  });

  it('saves a blob with the provided filename and delays object URL cleanup', () => {
    const click = vi.fn();
    const remove = vi.fn();
    const append = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
      remove,
    } as unknown as HTMLAnchorElement;
    const createElement = vi.fn().mockReturnValue(anchor);
    const setTimeout = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    const createObjectURL = vi.fn().mockReturnValue('blob:report');
    const revokeObjectURL = vi.fn();
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });

    stubGlobal('document', {
      body: { append },
      createElement,
    });
    stubGlobal('window', { setTimeout });
    stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    });

    saveBlobDownload(blob, 'sokrai-report.pdf', 30_000);

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:report');
    expect(anchor.download).toBe('sokrai-report.pdf');
    expect(append).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
  });
});
