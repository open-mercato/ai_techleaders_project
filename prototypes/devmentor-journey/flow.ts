export const DEMO_NOW = Date.parse('2026-09-10T08:00:00Z');
export const TIME_ZONES = ['Europe/Warsaw', 'UTC', 'America/New_York'] as const;
export const INITIAL_SLOTS = [
  { id:'too-soon', start:'2026-09-10T09:00:00Z', blockedReason:'Starts in less than 2 hours' },
  { id:'morning', start:'2026-09-10T10:00:00Z' },
  { id:'afternoon', start:'2026-09-10T13:00:00Z' },
  { id:'tomorrow', start:'2026-09-11T10:00:00Z' },
];
export type Slot = { id:string; start:string; blockedReason?:string };
export const money = (amount:number) => new Intl.NumberFormat('en-GB', {style:'currency',currency:'PLN',maximumFractionDigits:0}).format(amount);
export const timeLabel = (date:string, timeZone:string) => new Intl.DateTimeFormat('en-GB', {hour:'2-digit',minute:'2-digit',timeZone}).format(new Date(date));
export const dateLabel = (date:string, timeZone:string) => new Intl.DateTimeFormat('en-GB', {weekday:'short',day:'numeric',month:'long',timeZone}).format(new Date(date));
export function groupSlots(slots:Slot[], timeZone:string) {
  const grouped = new Map<string,{date:string;label:string;slots:(Slot & {label:string})[]}>();
  for (const slot of [...slots].sort((a,b)=>a.start.localeCompare(b.start))) {
    const date = new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone}).format(new Date(slot.start));
    if (!grouped.has(date)) grouped.set(date,{date,label:dateLabel(slot.start,timeZone),slots:[]});
    grouped.get(date)!.slots.push({...slot,label:timeLabel(slot.start,timeZone)});
  }
  return [...grouped.values()];
}
