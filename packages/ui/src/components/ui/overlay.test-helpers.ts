// Test-only DOM harness shared by overlay regression tests.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach } from 'vitest';

export function overlayHarness() {
  let host: HTMLDivElement;
  let root: Root;
  beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.assign(HTMLElement.prototype, {
      hasPointerCapture: () => false,
      setPointerCapture: () => {},
      releasePointerCapture: () => {},
      scrollIntoView: () => {},
    });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  return {
    renderSync(node: ReactNode) { act(() => root.render(node)); },
    async render(node: ReactNode) { await act(async () => root.render(node)); },
    async click(element: Element) {
      await act(async () => (element as HTMLElement).click());
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    },
    async focus(element: Element) { await act(async () => (element as HTMLElement).focus()); },
    async key(element: Element, key: string) {
      act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    },
  };
}

export function slot(name: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-slot="${name}"]`);
  if (!element) throw new Error(`Missing ${name}`);
  return element;
}
