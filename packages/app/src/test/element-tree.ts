import { isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Two functions for asserting on what a Server Component returned.
 *
 * `page.tsx` and `layout.tsx` are async functions that return an element tree; AGENTS.md's
 * "Testing React components and pages" says to invoke them and assert on that tree, with no
 * DOM and no renderer. The tree is a plain object graph, so walking it needs no library —
 * but every page test needs the same two questions answered, and copying the walk into each
 * one is how the eight of them would slowly stop agreeing about what "contains" means.
 *
 * The walk deliberately does **not** render child components. `<AuthLayout title="…">` stays
 * an element with props; its `children` are reachable because they are a prop. That is the
 * property that makes these tests assert on the page's own decisions — which component, with
 * which props — instead of on the design system's markup, which has its own tests.
 */

/** Every element in the tree, depth-first, the root included. */
export function elements(node: ReactNode): ReactElement[] {
  const found: ReactElement[] = [];
  visit(node, found);
  return found;
}

/**
 * Every string and number leaf, in document order, joined by a single space.
 *
 * Numbers are included because a React tree makes no distinction between `{0}` and `'0'`,
 * and a test asserting on visible copy should not have to either. Copy that a component
 * carries as a *prop* — `EmptyState`'s `title`, `ErrorMessage`'s `message` — is not here on
 * purpose: assert those on the prop, where the page actually wrote them.
 */
export function text(node: ReactNode): string {
  return leaves(node).join(' ');
}

function visit(node: ReactNode, found: ReactElement[]): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      visit(child, found);
    }
    return;
  }
  if (!isValidElement(node)) {
    return;
  }
  found.push(node);
  const { children } = node.props as { children?: ReactNode };
  visit(children, found);
}

function leaves(node: ReactNode): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => leaves(child));
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return [String(node)];
  }
  if (!isValidElement(node)) {
    return [];
  }
  return leaves((node.props as { children?: ReactNode }).children);
}
