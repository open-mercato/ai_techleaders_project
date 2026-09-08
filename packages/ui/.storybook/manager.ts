import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';

addons.setConfig({
  theme: create({
    base: 'light',
    brandTitle: 'DevMentor Design System',
    brandUrl: '?path=/story/design-system-components--gallery',
    brandTarget: '_self',
    colorPrimary: '#335cff',
    colorSecondary: '#335cff',
    fontBase: 'Inter, system-ui, sans-serif',
    fontCode: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    appBorderRadius: 8,
  }),
});
