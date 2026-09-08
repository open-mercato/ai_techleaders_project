import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { CrudForm } from '../../backend/forms/CrudForm';

const schema = z.object({
  minimum25: z.number().min(0), maximum25: z.number().min(0),
  minimum50: z.number().min(0), maximum50: z.number().min(0),
  platformFee: z.number().min(0, 'Use a percentage between 0 and 100.').max(100, 'Use a percentage between 0 and 100.'),
}).refine(value => value.maximum25 >= value.minimum25, { path: ['maximum25'], message: 'Maximum must be at least the minimum.' })
  .refine(value => value.maximum50 >= value.minimum50, { path: ['maximum50'], message: 'Maximum must be at least the minimum.' });

function SettingsExample() {
  const [saved, setSaved] = useState(false);
  return <div className="dm-product-panel"><div><span className="dm-product-eyebrow">Operator: EUR example configuration</span><h2 className="dm-product-heading">Session price bounds</h2><p className="dm-product-muted">Set the available price range for each session length and the platform fee.</p></div><CrudForm schema={schema} fields={[{ name: 'minimum25', label: '25 minutes: minimum', type: 'number' }, { name: 'maximum25', label: '25 minutes: maximum', type: 'number' }, { name: 'minimum50', label: '50 minutes: minimum', type: 'number' }, { name: 'maximum50', label: '50 minutes: maximum', type: 'number' }, { name: 'platformFee', label: 'Platform fee (%)', type: 'number' }]} initialValues={{ minimum25: 5, maximum25: 300, minimum50: 10, maximum50: 600, platformFee: 20 }} endpoint="/storybook-api/operator-settings" submitLabel="Save settings" onSuccess={() => setSaved(true)} />{saved && <p role="status" className="dm-product-callout">Saved in this local example. Product settings were not changed.</p>}</div>;
}
const meta = {
  title: 'Product/Operator settings', tags: ['autodocs'], render: () => <SettingsExample />,
  parameters: { msw: { handlers: [http.post('/storybook-api/operator-settings', () => HttpResponse.json({ ok: true, data: { saved: true } }))] }, docs: { description: { component: 'Settings form planned for 1.1 (#31), using CrudForm and a shared Zod schema shape. Values are local examples. The service must authorize the operator, enforce currency policy and apply the chosen fee. First-iteration payout operations still need a product decision (Q19).' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const PriceBoundsAndFee: Story = {};
