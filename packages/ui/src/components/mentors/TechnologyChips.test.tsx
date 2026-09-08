// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TechnologyChips } from './TechnologyChips';
afterEach(cleanup);

it('gives every catalogue technology a distinct decorative brand mark and keeps its label visible', () => {
  const stacks = ['TypeScript', 'React', 'Python', 'Django', 'Docker', 'Go', 'Next.js', 'Node.js', 'PostgreSQL'];
  const slugs = ['typescript', 'react', 'python', 'django', 'docker', 'go', 'nextdotjs', 'nodedotjs', 'postgresql'];
  const { container } = render(<TechnologyChips stacks={stacks} />);
  expect(screen.getByRole('list', { name: 'Technology stacks' }).children).toHaveLength(stacks.length);
  const paths = stacks.map((stack, index) => {
    const icon = screen.getByText(stack).previousElementSibling!;
    expect(icon.getAttribute('data-technology')).toBe(slugs[index]);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('focusable')).toBe('false');
    const path = icon.querySelector('path')!.getAttribute('d')!;
    expect(path.length).toBeGreaterThan(0);
    return path;
  });
  expect(new Set(paths).size).toBe(stacks.length);
  expect(container.querySelectorAll('img, svg title, .lucide-code-xml')).toHaveLength(0);
});

it('normalizes known names, distinguishes API topics and uses a code fallback only for unknown stacks', () => {
  const { rerender } = render(<TechnologyChips stacks={[' TypeSCRIPT ', 'API design', 'API', 'Unlisted technology', 'constructor']} label="Session topics" />);
  expect(screen.getByRole('list', { name: 'Session topics' }).children).toHaveLength(5);
  expect(screen.getByText('TypeSCRIPT').previousElementSibling?.getAttribute('data-technology')).toBe('typescript');
  expect(screen.getByText('API design').previousElementSibling?.classList.contains('lucide-braces')).toBe(true);
  expect(screen.getByText('API').previousElementSibling?.classList.contains('lucide-braces')).toBe(true);
  for (const stack of ['Unlisted technology', 'constructor']) {
    const icon = screen.getByText(stack).previousElementSibling!;
    expect(icon.classList.contains('lucide-code-xml')).toBe(true);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('focusable')).toBe('false');
  }
  rerender(<TechnologyChips stacks={[]} />);
  expect(screen.getByRole('list').children).toHaveLength(0);
});
