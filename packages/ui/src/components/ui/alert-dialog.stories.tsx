import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { Button } from './button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from './alert-dialog';

const meta = {
  title: 'Primitives/AlertDialog', component: AlertDialog, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'A consequential confirmation with a clearly named action and safe cancel. Compose Trigger, Content, Title, Description, Footer, Cancel and Action. Cancel receives initial focus; Escape cancels. The example changes local React state only. For asynchronous work, control open and call event.preventDefault() in Action onClick to keep it open until the operation succeeds; keep an available recovery path.' } } },
} satisfies Meta<typeof AlertDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

function DraftConfirmation() {
  const [discarded, setDiscarded] = useState(false);
  return <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
    <p role="status">{discarded ? 'The local example draft was discarded.' : 'You have an unsaved example draft.'}</p>
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline">Discard local draft</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogMedia><Trash2 aria-hidden="true" /></AlertDialogMedia><AlertDialogTitle>Discard this draft?</AlertDialogTitle><AlertDialogDescription>Your unsaved changes in this example will be removed.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => setDiscarded(true)}>Discard draft</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {discarded && <Button variant="ghost" onClick={() => setDiscarded(false)}>Reset example</Button>}
  </div>;
}
export const Confirmation: Story = { render: () => <DraftConfirmation /> };
export const Compact: Story = {
  render: () => <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Show compact confirmation</Button></AlertDialogTrigger><AlertDialogContent size="sm">
    <AlertDialogHeader><AlertDialogTitle>Leave this preview?</AlertDialogTitle><AlertDialogDescription>You can open the preview again from the catalogue.</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel>Stay</AlertDialogCancel><AlertDialogAction>Leave preview</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>,
};
export const DisabledAction: Story = {
  render: () => <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Show unavailable action</Button></AlertDialogTrigger><AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>Confirmation unavailable</AlertDialogTitle><AlertDialogDescription>The example action is disabled. Cancel remains available.</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction disabled>Confirm</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent></AlertDialog>,
};
