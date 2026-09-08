import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Progress } from './progress';
import { Button } from './button';
const meta = { title: 'Primitives/Progress', component: Progress, tags: ['autodocs'], args: { value: 60, 'aria-label': 'Profile completion' }, decorators: [Story => <div className="w-full max-w-xs"><Story /></div>], parameters: { docs: { description: { component: 'A 6-pixel progress track. Always provide an accessible label. A numeric value is determinate; omit value for ongoing work with unknown duration. Custom max values preserve the same visual and ARIA ratio.' } } } } satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Empty: Story = { args: {value:0} };
export const Complete: Story = { args: {value:100} };
export const Indeterminate: Story = { args: {value:null,'aria-label':'Loading sessions'} };
function ProfileSteps() { const [step,setStep]=useState(1); return <div className="grid gap-4"><p className="text-sm">Profile setup: {step} of 4 steps complete</p><Progress value={step} max={4} aria-label="Profile setup" /><Button size="sm" onClick={()=>setStep(value=>value===4?0:value+1)}>{step===4?'Start again':'Complete next step'}</Button></div>; }
export const Steps: Story = { render: () => <ProfileSteps /> };
