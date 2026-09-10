export interface FormatInstantOptions {
  locale?: Intl.LocalesArgument;
  timeZone?: string;
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone' | 'timeZoneName'>;
}

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/** Format an instant in a named zone and keep that zone explicit in the visible label. */
export function formatInstant(
  value: string,
  {
    locale = 'en-GB',
    timeZone = 'UTC',
    options = DEFAULT_OPTIONS,
  }: FormatInstantOptions = {},
): string {
  const label = new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
    new Date(value),
  );

  return `${label} (${timeZone})`;
}
