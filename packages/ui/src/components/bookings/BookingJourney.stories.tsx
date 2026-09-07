import { useId, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from '../ui/button';
import { MentorProfileCard } from '../mentors/MentorProfileCard';
import { AvailabilityPicker, DurationSelector } from '../availability/AvailabilityPicker';
import { EmptyState } from '../../backend/feedback/EmptyState';
import { BookingSummary } from './BookingSummary';

const slots = [
  { id: 'wed-14', start: '2026-09-09T12:00:00Z', label: '14:00' },
  { id: 'wed-15', start: '2026-09-09T13:00:00Z', label: '15:00', blockedReason: 'Already booked' },
  { id: 'wed-16', start: '2026-09-09T14:00:00Z', label: '16:00' },
];

function BookingJourney() {
  const timesId = useId();
  const [slotId, setSlotId] = useState<string | null>(null);
  const [duration, setDuration] = useState<25 | 50 | null>(25);
  const [checkoutRequested, setCheckoutRequested] = useState(false);
  const slot = slots.find(item => item.id === slotId);
  return <div className="dm-product-stack">
    <header><span className="dm-product-eyebrow">DevMentor: Text mentoring</span><h1 className="dm-product-heading">Book a text session with a mentor</h1><p className="dm-product-muted">Choose a mentor, a time and the session length that fits your question.</p></header>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="dm-product-stack">
        <MentorProfileCard name="Alex Laurent" headline="Staff engineer: developer tooling" initials="AL" introduction="I help developers work through TypeScript API problems, decide what to test and make their code easier to change. Bring a specific question and the context behind it." stacks={['TypeScript', 'React', 'Node.js']} publicWork={[{ label: 'Open source work', href: 'https://example.com/alex/work' }]} availability="Wednesday, 9 September" status="published" actions={<Button asChild intent="neutral" appearance="stroke"><a href={`#${timesId}`}><span className="dm-button-label">Choose a time</span></a></Button>} />
        <div id={timesId} className="dm-product-panel">
          <AvailabilityPicker days={[{ date: '2026-09-09', label: 'Wednesday, 9 September', slots }]} timeZone="Europe/Warsaw" selectedSlotId={slotId} onSlotChange={value => { setSlotId(value); setCheckoutRequested(false); }} />
          <div className="dm-product-divider" />
          <DurationSelector options={[{ minutes: 25, price: 'EUR 45.00' }, { minutes: 50, price: 'EUR 80.00' }]} selected={duration} onChange={value => { setDuration(value); setCheckoutRequested(false); }} />
        </div>
      </div>
      <aside aria-label="Booking details">
        {slot && duration ? <BookingSummary mentorName="Alex Laurent" startsAt={slot.start} dateLabel="Wednesday, 9 September 2026" timeLabel={`${slot.label}: ${duration} minutes`} timeZone="Europe/Warsaw" duration={duration} total={duration === 25 ? 'EUR 45.00' : 'EUR 80.00'} notice={checkoutRequested ? 'Checkout was requested in this local example. No payment was made and no booking was confirmed.' : undefined} actions={<Button onClick={() => setCheckoutRequested(true)}>Continue to secure checkout</Button>} /> : <EmptyState title="Your booking summary" description="Choose an available time to see your booking summary. Every session is a text conversation." />}
      </aside>
    </div>
    <p className="dm-product-caption">Interactive local composition. Booking eligibility and payment confirmation remain server responsibilities; this example does not contact Stripe.</p>
  </div>;
}

const meta = {
  title: 'Product/Reference flow', render: () => <BookingJourney />, tags: ['autodocs'],
  parameters: { layout: 'padded', docs: { description: { component: 'A booking flow using DevMentor components: mentor profile, slot selection, 25/50-minute prices and a synchronized booking summary. Try a booked slot, change the session length and request checkout. The example stops before payment confirmation. Session channel Q18 and first-iteration payout policy Q19 remain external product decisions.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const FirstBooking: Story = {};
export const SelectAndReview: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: '14:00' }));
  await expect(canvas.getByRole('region', { name: 'Your session with Alex Laurent' })).toBeVisible();
  await userEvent.click(canvas.getByRole('button', { name: '50 minutes EUR 80.00' }));
  await expect(canvas.getByText('50-minute text session')).toBeVisible();
  await expect(canvas.getByRole('button', { name: '15:00' })).toBeDisabled();
  await userEvent.click(canvas.getByRole('button', { name: 'Continue to secure checkout' }));
  await expect(canvas.getByRole('status')).toHaveTextContent('No payment was made and no booking was confirmed.');
} };
