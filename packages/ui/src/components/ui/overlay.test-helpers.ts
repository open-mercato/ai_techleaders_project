// Test-only DOM harness shared by overlay regression tests.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, vi } from 'vitest';

export function mockTopLayerSelectors() {
  // jsdom 26 / nwsapi 2.2.27 recurse through Element.matches for native top-layer
  // states. Radix portals in these tests never enter that layer. Keep all other
  // selectors and the real Floating UI geometry/positioning code intact.
  const matches = Element.prototype.matches;
  return vi.spyOn(Element.prototype, 'matches').mockImplementation(function (this: Element, selector) {
    if (selector === ':popover-open' || selector === ':modal' || selector === ':fullscreen') return false;
    return matches.call(this, selector);
  });
}

export function overlayHarness() {
  let host: HTMLDivElement;
  let root: Root;
  let topLayerSelectors: ReturnType<typeof mockTopLayerSelectors>;
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
    topLayerSelectors = mockTopLayerSelectors();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    try {
      await act(async () => root.unmount());
    } finally {
      host.remove();
      topLayerSelectors.mockRestore();
    }
  });
  return {
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
