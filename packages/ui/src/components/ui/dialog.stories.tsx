import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './dialog';

const meta = {
  title: 'Primitives/Dialog', component: Dialog, tags: ['autodocs'],
  args: { defaultOpen: false },
  parameters: { docs: { description: { component: 'A modal for a focused task. Compose Trigger → Content → Header/Title/Description and Footer; use asChild to reuse Button. Title provides the accessible name. Content portals to the document, traps focus and restores it to the trigger when closed. Keep the page theme on the document root so portals inherit it. Use AlertDialog for consequential confirmation.' } } },
  render: args => <Dialog {...args}>
    <DialogTrigger asChild><Button>View session details</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Frontend architecture session</DialogTitle><DialogDescription>Example session: Europe/Warsaw</DialogDescription></DialogHeader>
      <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: 0 }}>
        <dt>Duration</dt><dd style={{ margin: 0 }}>60 minutes</dd><dt>Topic</dt><dd style={{ margin: 0 }}>Component boundaries</dd>
      </dl>
      <DialogFooter><DialogClose asChild><Button variant="outline">Close details</Button></DialogClose></DialogFooter>
    </DialogContent>
  </Dialog>,
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Open: Story = { args: { defaultOpen: true } };
export const LongContent: Story = {
  render: () => <Dialog><DialogTrigger asChild><Button variant="outline">Read preparation guide</Button></DialogTrigger><DialogContent>
    <DialogHeader><DialogTitle>Prepare for your session</DialogTitle><DialogDescription>Bring one focused question and a small example.</DialogDescription></DialogHeader>
    <div style={{ display: 'grid', gap: 16 }}>{['Describe the result you want', 'Share relevant context', 'Remove secrets from examples', 'List approaches already tried', 'Note the questions to discuss', 'Check your time zone'].map(item => <section key={item}><h3 style={{ fontSize: 14, fontWeight: 500 }}>{item}</h3><p style={{ color: 'var(--dm-text-sub-600)' }}>Use this checklist to organize your own preparation. This example remains in the local catalogue.</p></section>)}</div>
    <DialogFooter showCloseButton />
  </DialogContent></Dialog>,
};
