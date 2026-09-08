import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { AvailabilityPicker, DurationSelector, type AvailabilityPickerProps } from './AvailabilityPicker';
const days = [
  { date: '2026-09-09', label: 'Wednesday, 9 September', slots: [{ id: 'soon', start: '2026-09-09T09:00:00Z', label: '11:00', blockedReason: 'Starts in less than 2 hours' }, { id: 'wed-14', start: '2026-09-09T12:00:00Z', label: '14:00' }, { id: 'wed-15', start: '2026-09-09T13:00:00Z', label: '15:00', blockedReason: 'Already booked' }, { id: 'wed-16', start: '2026-09-09T14:00:00Z', label: '16:00' }] },
  { date: '2026-09-10', label: 'Thursday, 10 September', slots: [{ id: 'thu-10', start: '2026-09-10T08:00:00Z', label: '10:00' }, { id: 'thu-14', start: '2026-09-10T12:00:00Z', label: '14:00' }] },
];
function PickerExample(args: AvailabilityPickerProps) {
  const [selectedSlotId, setSelectedSlotId] = useState(args.selectedSlotId);
  const [duration, setDuration] = useState<25 | 50 | null>(25);
  return <div className="dm-product-panel"><AvailabilityPicker {...args} selectedSlotId={selectedSlotId} onSlotChange={id => { setSelectedSlotId(id); args.onSlotChange(id); }} /><div className="dm-product-divider" /><DurationSelector options={[{ minutes: 25, price: 'EUR 45.00' }, { minutes: 50, price: 'EUR 80.00' }]} selected={duration} onChange={setDuration} /><p className="dm-product-caption">Text mentoring session. Prices and availability are supplied by the mentor.</p></div>;
}
const meta = {
  title: 'Product/Availability', component: AvailabilityPicker, tags: ['autodocs'], render: args => <PickerExample {...args} />,
  args: { days, timeZone: 'Europe/Warsaw', selectedSlotId: null, onSlotChange: fn() },
  parameters: { docs: { description: { component: 'Available time and 25/50-minute price choices for #17, #18 and #21. The application evaluates lead time, booked slots and configured price bounds; these components display supplied reasons. A blocked slot has a disabled button and a linked explanation. Timezone and formatted prices are always explicit.' } } },
} satisfies Meta<typeof AvailabilityPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ChooseTimeAndDuration: Story = { play: async ({ canvasElement, args }) => { const canvas = within(canvasElement); const slot = canvas.getAllByRole('button', { name: '14:00' })[0]!; await userEvent.click(slot); await expect(slot).toHaveAttribute('aria-pressed', 'true'); await expect(args.onSlotChange).toHaveBeenCalledWith('wed-14'); await expect(canvas.getByRole('button', { name: '11:00' })).toBeDisabled(); } };
export const Selected: Story = { args: { selectedSlotId: 'wed-14' } };
export const Refreshing: Story = { args: { disabled: true, selectedSlotId: 'wed-14' } };
export const Empty: Story = { args: { days: [] } };
export const AllTimesTaken: Story = { args: { days: [{ date: '2026-09-09', label: 'Wednesday, 9 September', slots: [{ id: '1', start: '2026-09-09T12:00:00Z', label: '14:00', blockedReason: 'Already booked' }, { id: '2', start: '2026-09-09T13:00:00Z', label: '15:00', blockedReason: 'Already booked' }] }] } };
export const MissingPrice: Story = { render: () => <DurationSelector options={[{ minutes: 25, price: 'EUR 45.00' }, { minutes: 50, price: 'Not available', unavailableReason: 'This session price has not been configured.' }]} selected={25} onChange={fn()} /> };
