import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { DisputeDetail } from './DisputeDetail';
const meta = {
  title: 'Product/Disputes', component: DisputeDetail, tags: ['autodocs'],
  args: { reference: 'D-101', state: 'open', sessionLabel: 'Jamie Chen with Alex Laurent: 9 September, 14:00 Europe/Warsaw', reason: 'The written answer does not address the migration constraint raised during the text session.', evidence: <div className="dm-product-callout"><strong>Session evidence</strong><p>Transcript excerpt and answer are provided here only after the operator&apos;s access is authorized.</p></div>, actions: <Button>Record resolution</Button> },
  parameters: { docs: { description: { component: 'Later 1.1 operator composition for #32. The caller supplies authorized transcript evidence and the outcome form using CrudForm. Private session notes are not automatically included. Recording the outcome does not automatically refund a payment.' } } },
} satisfies Meta<typeof DisputeDetail>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const Resolved: Story = { args: { state: 'resolved', outcome: 'The mentor provided a follow-up answer covering the migration constraint. Both participants were informed.', actions: undefined } };
