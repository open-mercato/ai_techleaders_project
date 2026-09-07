// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { TechnologyChips } from './TechnologyChips';
afterEach(cleanup);

it('keeps technology names visible with recognizable decorative icons and a code fallback', () => {
  const { container, rerender } = render(<TechnologyChips stacks={['TypeScript', 'React', 'API design', 'API', 'PostgreSQL']} />);
  expect(screen.getByRole('list', { name: 'Technology stacks' }).children).toHaveLength(5);
  expect(screen.getByText('TS').getAttribute('aria-hidden')).toBe('true');
  expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
  expect(screen.getByText('TypeScript')).toBeTruthy();
  expect(screen.getByText('React').previousElementSibling?.classList.contains('lucide-atom')).toBe(true);
  expect(screen.getByText('API design').previousElementSibling?.classList.contains('lucide-braces')).toBe(true);
  expect(screen.getByText('PostgreSQL').previousElementSibling?.classList.contains('lucide-code-xml')).toBe(true);
  rerender(<TechnologyChips stacks={['typescript']} label="Session topics" />);
  expect(screen.getByRole('list', { name: 'Session topics' }).children).toHaveLength(1);
  expect(screen.getByText('TS')).toBeTruthy();
  rerender(<TechnologyChips stacks={[]} />);
  expect(screen.getByRole('list').children).toHaveLength(0);
});
