import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleCheck, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from './alert';
import { Button } from './button';
const meta = { title: 'Primitives/Alert', component: Alert, tags: ['autodocs'], args: { children:<><Info aria-hidden="true" /><AlertDescription>Your mentor will reply in writing.</AlertDescription></> }, decorators: [Story => <div className="w-full max-w-lg"><Story /></div>], parameters: { docs: { description: { component: 'Contextual feedback with explicit status text. Use alert for urgent changes and role=status for routine confirmation. Recovery actions belong next to a specific, understandable problem.' } } } } satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Information: Story = {};
export const Success: Story = { args: {variant:'success',role:'status',children:<><CircleCheck aria-hidden="true" /><AlertDescription>Your profile has been saved.</AlertDescription></>} };
export const Warning: Story = { args: {variant:'warning',children:<><TriangleAlert aria-hidden="true" /><AlertTitle>Complete your profile</AlertTitle><AlertDescription>Add your price before sharing an invitation.</AlertDescription></>} };
export const Error: Story = { args: {variant:'destructive',children:<><CircleAlert aria-hidden="true" /><AlertTitle>We could not load your sessions</AlertTitle><AlertDescription>Your saved sessions are still available. Try loading the list again.</AlertDescription></>} };
function RecoverableNotice() { const [recovered,setRecovered]=useState(false); return recovered ? <Alert variant="success" role="status"><CircleCheck aria-hidden="true" /><AlertDescription>Your sessions are up to date.</AlertDescription></Alert> : <Alert variant="destructive"><CircleAlert aria-hidden="true" /><AlertTitle>We could not load your sessions</AlertTitle><AlertDescription><p>Try the request again.</p><Button size="xs" intent="neutral" appearance="stroke" onClick={()=>setRecovered(true)}>Try again</Button></AlertDescription></Alert>; }
export const Recovery: Story = { render: () => <RecoverableNotice /> };
