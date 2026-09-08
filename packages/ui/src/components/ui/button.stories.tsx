import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { LoaderCircle, Plus } from 'lucide-react';
import { Button } from './button';

const intents = ['primary', 'neutral', 'error'] as const;
const appearances = ['filled', 'stroke', 'lighter', 'ghost'] as const;
const sizes = ['md', 'sm', 'xs', 'xxs'] as const;
const Glyph = ({ direction }: { direction: 'left' | 'right' }) => <span className={`figma-glyph figma-chevron-${direction}`} />;
const meta = {
  title: 'Primitives/Button', component: Button,
  args: { children: 'Button', intent: 'primary', appearance: 'filled', size: 'md', disabled: false, onClick: fn(), leadingIcon: <Glyph direction="left" />, trailingIcon: <Glyph direction="right" /> },
  argTypes: {
    intent: { control: 'inline-radio', options: intents },
    appearance: { control: 'inline-radio', options: appearances },
    size: { control: 'inline-radio', options: sizes },
    children: { control: 'text' }, disabled: { control: 'boolean' }, iconOnly: { control: 'boolean' },
    variant: { table: { disable: true } }, asChild: { control: false },
    leadingIcon: { control: false }, trailingIcon: { control: false },
  },
  parameters: { docs: { description: { component: 'DevMentor buttons: three intents, four appearances, four heights, Inter 14/20 and leading/trailing icon slots.' } } },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Variants: Story = {
  render: args => <div className="ds-matrix-scroll"><table className="ds-button-matrix"><caption>3 types × 4 styles</caption><thead><tr><th scope="col">Type</th>{appearances.map(style => <th scope="col" key={style}>{style}</th>)}</tr></thead><tbody>{intents.map(intent => <tr key={intent}><th scope="row">{intent}</th>{appearances.map(appearance => <td key={appearance}><Button {...args} intent={intent} appearance={appearance} /></td>)}</tr>)}</tbody></table></div>,
};
export const Sizes: Story = {
  render: args => <div className="ds-size-row">{sizes.map((size, index) => <div key={size}><Button {...args} size={size} /><p>{['Medium: 40px', 'Small: 36px', 'X-Small: 32px', '2X-Small: 28px'][index]}</p></div>)}</div>,
};
export const StateMatrix: Story = {
  parameters: { controls: { disable: true } },
  render: args => <div className="ds-matrix-scroll"><table className="ds-button-matrix"><caption>Visual state specimens: use Playground for live interactions</caption><thead><tr><th scope="col">Type / Style</th>{['Default', 'Hover', 'Focus', 'Disabled'].map(state => <th scope="col" key={state}>{state}</th>)}</tr></thead><tbody>{intents.flatMap(intent => appearances.map(appearance => <tr key={intent + appearance}><th scope="row">{intent}<span>{appearance}</span></th>{['default', 'hover', 'focus', 'disabled'].map(state => <td key={state}><Button {...args} intent={intent} appearance={appearance} disabled={state === 'disabled'} data-preview-state={state} /></td>)}</tr>))}</tbody></table></div>,
};
export const WithoutIcons: Story = { args: { leadingIcon: undefined, trailingIcon: undefined, children: 'Book a session' } };
export const IconOnly: Story = { args: { iconOnly: true, children: <Plus aria-hidden="true" />, 'aria-label': 'Add availability' }, argTypes: { children: { control: false } } };
export const Disabled: Story = { args: { disabled: true } };
export const LoadingComposition: Story = { args: { disabled: true, 'aria-busy': true, children: 'Saving…', leadingIcon: <LoaderCircle className="animate-spin motion-reduce:animate-none" />, trailingIcon: undefined } };
export const LongLabel: Story = { args: { children: 'Review the written answer from your mentoring session', leadingIcon: undefined, trailingIcon: undefined } };
export const ClickInteraction: Story = {
  parameters: { controls: { disable: true } },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button');
    if (args.disabled) await expect(button).toBeDisabled();
    else { await userEvent.click(button); await expect(args.onClick).toHaveBeenCalled(); }
  },
};
export const AsLink: Story = {
  render: args => <div><Button {...args} asChild intent="neutral" appearance="stroke"><a href="#session-details"><span className="dm-button-label">View session details</span></a></Button><section id="session-details" tabIndex={-1} className="mt-8 rounded-lg border border-border p-4"><h2 className="font-semibold">Session details</h2><p className="text-sm text-muted-foreground">An example destination inside this story.</p></section></div>,
};
