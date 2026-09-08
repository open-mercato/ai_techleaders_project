import { useEffect, type ReactNode } from 'react';
import type { Preview } from '@storybook/react-vite';
import { setupWorker } from 'msw/browser';
import { mswLoader } from 'msw-storybook-addon/csf3';
import './preview.css';

function ThemeBoundary({ appearance, children }: { appearance: string; children: ReactNode }) {
  const dark = appearance.endsWith('dark');
  useEffect(() => {
    // Portals mount outside the story wrapper and must inherit the same theme.
    const root = document.documentElement;
    root.classList.toggle('dark', dark);
    root.dataset.alignAccent = appearance.startsWith('green') ? 'green' : 'blue';
    root.style.colorScheme = dark ? 'dark' : 'light';
  }, [appearance, dark]);
  return <div className={`${dark ? 'dark' : ''} story-theme`} data-align-accent={appearance.startsWith('green') ? 'green' : 'blue'}>
    <div className="story-surface">{children}</div>
  </div>;
}

const preview: Preview = {
  initialGlobals: { appearance: 'blue-light' },
  globalTypes: {
    appearance: {
      description: 'DevMentor color themes and appearance',
      toolbar: {
        title: 'Theme', icon: 'paintbrush', dynamicTitle: true,
        items: [
          { value: 'blue-light', title: 'Blue / Light' },
          { value: 'blue-dark', title: 'Blue / Dark' },
          { value: 'green-light', title: 'Green / Light' },
          { value: 'green-dark', title: 'Green / Dark' },
        ],
      },
    },
  },
  loaders: [mswLoader(async () => {
    const worker = setupWorker();
    await worker.start({
      quiet: true,
      onUnhandledRequest(request, print) {
        const path = new URL(request.url).pathname;
        if (path.startsWith('/storybook-api/') || path.startsWith('/api/')) print.error();
      },
    });
    return worker;
  })],
  decorators: [(Story, context) => <ThemeBoundary appearance={String(context.globals.appearance)}><Story /></ThemeBoundary>],
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true, matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: { storySort: { order: ['Design system', ['Components', 'Start here', 'What is missing', '*'], 'Foundations', 'Primitives', 'Backend', 'Product', 'Patterns'] } },
    a11y: { test: 'todo' },
    docs: { toc: true },
  },
};

export default preview;
