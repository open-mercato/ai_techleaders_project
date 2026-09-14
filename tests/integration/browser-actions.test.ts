import { beforeEach, describe, expect, it, vi } from 'vitest';

const browser = vi.hoisted(() => ({ runAgentBrowser: vi.fn() }));
vi.mock('./agent-browser', () => ({ runAgentBrowser: browser.runAgentBrowser }));

const { clickNamed } = await import('./browser-actions');

function snapshot(refs: Record<string, { role: string; name: string }>): string {
  return JSON.stringify({ data: { refs } });
}

beforeEach(() => {
  vi.clearAllMocks();
  browser.runAgentBrowser.mockResolvedValue(snapshot({
    e1: { role: 'button', name: 'Cancel session' },
    e2: { role: 'link', name: 'Cancel session' },
    e3: { role: 'button', name: 'Cancel session' },
  }));
});

describe('clickNamed', () => {
  it('takes a fresh snapshot, because refs are reassigned on every one', async () => {
    await clickNamed('session-1', 'button', /^Cancel session$/);

    expect(browser.runAgentBrowser).toHaveBeenNthCalledWith(
      1, 'session-1', 'snapshot', '-i', '--json',
    );
  });

  it('clicks the first control of that role and name', async () => {
    await clickNamed('session-1', 'button', /^Cancel session$/);

    // `e2` is a link with the same name and must not be picked.
    expect(browser.runAgentBrowser).toHaveBeenNthCalledWith(2, 'session-1', 'click', '@e1');
  });

  it('can take the last, which is how a dialog confirm is reached', async () => {
    await clickNamed('session-1', 'button', /^Cancel session$/, 'last');

    expect(browser.runAgentBrowser).toHaveBeenNthCalledWith(2, 'session-1', 'click', '@e3');
  });

  it('matches on a pattern rather than an exact string', async () => {
    browser.runAgentBrowser.mockResolvedValue(snapshot({
      e1: { role: 'button', name: '25 minutes PLN 90.00' },
    }));

    await clickNamed('session-1', 'button', /25 minutes/);

    expect(browser.runAgentBrowser).toHaveBeenNthCalledWith(2, 'session-1', 'click', '@e1');
  });

  it('says what the tree did contain when nothing matches', async () => {
    browser.runAgentBrowser.mockResolvedValue(snapshot({
      e1: { role: 'heading', name: 'Book a session' },
    }));

    // A bare "not found" turns a scenario failure into an investigation.
    await expect(clickNamed('session-1', 'button', /Continue/)).rejects.toThrow(
      'No button named /Continue/ in the tree. Present: heading "Book a session"',
    );
    expect(browser.runAgentBrowser).toHaveBeenCalledOnce();
  });
});
