import { LocalTime } from '../../time/LocalTime';

export interface SlotTimeProps {
  startsAt: string;
  meetsLeadTime?: boolean;
}

/** One slot instant, shared by owner tables and the public lead-time presentation. */
export function SlotTime({ startsAt, meetsLeadTime }: SlotTimeProps) {
  return <div className="flex flex-col gap-1">
    <LocalTime value={startsAt} />
    {meetsLeadTime === true ? (
      <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Available</span>
    ) : meetsLeadTime === false ? (
      <span className="text-sm text-slate-600 dark:text-slate-400">
        Unavailable because this time starts in less than two hours.
      </span>
    ) : null}
  </div>;
}
