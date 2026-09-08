'use client';

import { useId } from 'react';
import { Button } from '../ui/button';

export interface AvailabilitySlot {
  id: string;
  start: string;
  label: string;
  /** Availability and lead-time rules are evaluated by the caller/server. */
  blockedReason?: string;
}

export interface AvailabilityPickerProps {
  days: { date: string; label: string; slots: AvailabilitySlot[] }[];
  timeZone: string;
  selectedSlotId: string | null;
  onSlotChange: (slotId: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

export function AvailabilityPicker({ days, timeZone, selectedSlotId, onSlotChange, disabled = false, emptyMessage = 'No sessions are available yet. Check back for newly published times.' }: AvailabilityPickerProps) {
  const id = useId();
  const hasSlots = days.some(day => day.slots.length > 0);
  return <section className="dm-product-stack" aria-labelledby={`${id}-title`}>
    <div><h3 id={`${id}-title`} className="dm-product-title">Choose a time</h3><p className="dm-product-muted">Times shown in {timeZone}. Sessions must start at least 2 hours after booking.</p></div>
    {hasSlots ? days.map(day => <fieldset key={day.date} className="dm-slot-day">
      <legend><time dateTime={day.date}>{day.label}</time></legend>
      <div className="dm-slot-grid">{day.slots.map(slot => <div key={slot.id} className="dm-slot-option">
        <Button type="button" intent={selectedSlotId === slot.id ? 'primary' : 'neutral'} appearance="stroke" aria-pressed={selectedSlotId === slot.id} aria-describedby={slot.blockedReason ? `${id}-${slot.id}-reason` : undefined} disabled={disabled || Boolean(slot.blockedReason)} onClick={() => onSlotChange(slot.id)}>
          <time dateTime={slot.start}>{slot.label}</time>
        </Button>
        {slot.blockedReason && <p id={`${id}-${slot.id}-reason`} className="dm-product-caption">{slot.blockedReason}</p>}
      </div>)}</div>
    </fieldset>) : <p className="dm-product-callout" role="status">{emptyMessage}</p>}
  </section>;
}

export interface DurationOption {
  minutes: 25 | 50;
  price: string;
  unavailableReason?: string;
}

export interface DurationSelectorProps {
  options: DurationOption[];
  selected: 25 | 50 | null;
  onChange: (minutes: 25 | 50) => void;
  disabled?: boolean;
}

export function DurationSelector({ options, selected, onChange, disabled = false }: DurationSelectorProps) {
  const id = useId();
  return <fieldset className="dm-slot-day"><legend>Session length</legend><div className="dm-duration-grid">
    {options.map(option => <div key={option.minutes} className="dm-slot-option"><Button type="button" intent={selected === option.minutes ? 'primary' : 'neutral'} appearance="stroke" aria-pressed={selected === option.minutes} aria-describedby={option.unavailableReason ? `${id}-${option.minutes}` : undefined} disabled={disabled || Boolean(option.unavailableReason)} onClick={() => onChange(option.minutes)} className="dm-duration-option"><span>{option.minutes} minutes</span><strong>{option.price}</strong></Button>{option.unavailableReason && <p id={`${id}-${option.minutes}`} className="dm-product-caption">{option.unavailableReason}</p>}</div>)}
  </div></fieldset>;
}
