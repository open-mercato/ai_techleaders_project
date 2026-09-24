import { describe, expect, it } from 'vitest';
import { elements, text } from '../test/element-tree';
import RootLayout from './layout';

describe('root layout', () => {
  it('ignores extension-added body attributes without suppressing descendant warnings', () => {
    const tree = RootLayout({ children: 'page' });
    const body = elements(tree).find((element) => element.type === 'body');

    expect(body?.props).toMatchObject({
      className: 'min-h-full bg-background text-foreground',
      suppressHydrationWarning: true,
    });
    expect(text(tree)).toBe('page');
  });
});
