'use client';

import { useEffect, useState, type TimeHTMLAttributes } from 'react';
import { formatInstant } from './formatInstant';

export interface LocalTimeProps
  extends Omit<TimeHTMLAttributes<HTMLTimeElement>, 'children' | 'dateTime'> {
  value: string;
  locale?: Intl.LocalesArgument;
  options?: Omit<Intl.DateTimeFormatOptions, 'timeZone' | 'timeZoneName'>;
}

/** Render UTC during SSR and hydration, then switch to the viewer's zone after mount. */
export function LocalTime({ value, locale, options, ...timeProps }: LocalTimeProps) {
  const [label, setLabel] = useState(() => formatInstant(value, { locale, options }));

  useEffect(() => {
    const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    queueMicrotask(() => {
      setLabel(formatInstant(value, { locale, options, timeZone }));
    });
  }, [locale, options, value]);

  return <time {...timeProps} dateTime={value}>{label}</time>;
}
