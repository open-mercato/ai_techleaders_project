import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '../ui/button';
import { MentorOnboarding, type MentorOnboardingStep } from './MentorOnboarding';

const steps: MentorOnboardingStep[] = [
  { id: 'invitation', title: 'Accept your invitation', description: 'Your mentor access is active.', complete: true },
  { id: 'profile', title: 'Complete and publish your profile', description: 'Add a description, a link to your public work and the technologies you can help with.', complete: false, action: <Button onClick={fn()}>Edit profile</Button> },
  { id: 'prices', title: 'Set session prices', description: 'Set a PLN price for both 25-minute and 50-minute sessions.', complete: false, action: <Button intent="neutral" appearance="stroke" onClick={fn()}>Set prices</Button> },
  { id: 'availability', title: 'Add your first available time', description: 'Choose a time you can meet by text. Mentees can choose their session length when booking.', complete: false, action: <Button intent="neutral" appearance="stroke" onClick={fn()}>Add a time</Button> },
];
const meta = {
  title: 'Product/Mentor onboarding', component: MentorOnboarding, tags: ['autodocs'],
  args: { steps, dueDateLabel: '23 September 2026' },
  parameters: { docs: { description: { component: 'The E02 mentor setup checklist displays host-supplied completion and publication deadlines. The host determines access, publication and booking eligibility and supplies each action. Completion includes text as well as color. No task status or deadline is inferred from the current date.' } } },
} satisfies Meta<typeof MentorOnboarding>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FirstVisit: Story = {};
export const ProfilePublished: Story = { args: { steps: steps.map(step => step.id === 'profile' ? { ...step, complete: true, action: <Button intent="neutral" appearance="stroke" onClick={fn()}>View profile</Button> } : step) } };
export const ReadyForBookings: Story = {
  args: { title: 'Your profile is ready', description: 'Your profile, prices and available times are public.', dueDateLabel: undefined, steps: steps.map(step => ({ ...step, complete: true, action: undefined })) },
};
export const Empty: Story = { args: { title: 'Mentor setup', description: 'Your mentor account has no setup tasks.', dueDateLabel: undefined, steps: [] } };
export const Mobile: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
