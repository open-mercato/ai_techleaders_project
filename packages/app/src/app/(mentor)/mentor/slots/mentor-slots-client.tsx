'use client';

import { slotCreateSchema } from '@devmentor/core/validators/availability/slot-create.schema';
import { Button, Card, Checkbox, SlotTime } from '@devmentor/ui';
import {
  apiCall,
  CrudForm,
  DataTable,
  ErrorMessage,
  useApiResource,
  type Column,
} from '@devmentor/ui/backend';
import { useId, useState } from 'react';

export interface MentorSlotResource {
  id: string;
  startsAt: string;
}

export function visibleMentorSlots(
  slots: MentorSlotResource[],
  showPast: boolean,
  now: number,
): MentorSlotResource[] {
  return showPast ? slots : slots.filter((slot) => Date.parse(slot.startsAt) >= now);
}

const columns: Column<MentorSlotResource>[] = [
  { key: 'startsAt', header: 'Start time', render: (slot) => <SlotTime startsAt={slot.startsAt} /> },
];

export function MentorSlotsClient() {
  const resource = useApiResource<MentorSlotResource[]>('/api/availability/slots');
  const [showPast, setShowPast] = useState(false);
  const [now] = useState(() => Date.now());
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const toggleId = useId();
  const rows = resource.data === undefined
    ? undefined
    : visibleMentorSlots(resource.data, showPast, now);

  async function remove(slot: MentorSlotResource) {
    setRemovingId(slot.id);
    setRemoveError(null);
    try {
      const result = await apiCall<{ id: string }>(`/api/availability/slots/${slot.id}`, {
        method: 'DELETE',
      });
      if (result.ok) resource.reload();
      else setRemoveError(result.error.message);
    } catch {
      setRemoveError('We could not remove this time. Try again.');
    } finally {
      setRemovingId(null);
    }
  }

  return <div className="flex flex-col gap-6">
    <Card className="dm-product-panel">
      <div>
        <h2 className="dm-product-heading">Add an available time</h2>
        <p className="dm-product-muted">Choose the local date and time when you can start a session.</p>
      </div>
      <CrudForm
        schema={slotCreateSchema}
        fields={[{
          name: 'startsAt',
          label: 'Start time',
          type: 'datetime',
          required: true,
          description: 'The saved time will appear in each visitor’s local timezone.',
        }]}
        endpoint="/api/availability/slots"
        submitLabel="Add available time"
        onSuccess={resource.reload}
      />
    </Card>

    <Card className="dm-product-panel">
      <div>
        <h2 className="dm-product-heading">Published times</h2>
        <p className="dm-product-muted">Remove a time when you can no longer offer it.</p>
      </div>
      <label htmlFor={toggleId} className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium">
        <Checkbox id={toggleId} checked={showPast} onCheckedChange={(checked) => setShowPast(checked === true)} />
        Show past times
      </label>
      <DataTable
        caption="Published availability"
        columns={columns}
        rows={rows}
        getRowId={(slot) => slot.id}
        loading={resource.loading}
        error={resource.error}
        onRetry={resource.reload}
        emptyMessage={showPast ? 'No times published' : 'No upcoming times'}
        emptyDescription="Add a start time when you can offer a text mentoring session."
        rowActions={(slot) => <Button
          type="button"
          intent="error"
          appearance="ghost"
          size="sm"
          disabled={removingId !== null}
          aria-busy={removingId === slot.id}
          onClick={() => void remove(slot)}
        >
          {removingId === slot.id ? 'Removing…' : 'Remove time'}
        </Button>}
      />
      {removeError ? <ErrorMessage message={removeError} /> : null}
    </Card>
  </div>;
}
