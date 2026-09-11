'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Checkbox } from '../../components/ui/checkbox';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { apiCall } from '../api/apiCall';
import type { FieldErrors } from '../api/types';

export type CrudFieldType = 'text' | 'email' | 'password' | 'number' | 'money' | 'date' | 'datetime' | 'datetime-local' | 'textarea' | 'checkbox' | 'select' | 'multiselect';

export interface CrudFieldRenderProps {
  inputProps: {
    id: string;
    name: string;
    disabled: boolean;
    required?: boolean;
    autoComplete?: string;
    'aria-required': boolean;
    'aria-invalid': boolean;
    'aria-describedby'?: string;
  };
  labelId: string;
  value: unknown;
  onChange: (value: unknown) => void;
}

export interface CrudField {
  name: string;
  label: string;
  type?: CrudFieldType;
  placeholder?: string;
  /** Persistent helper text associated with the field, including when it has errors. */
  description?: string;
  autoComplete?: string;
  /** Marks a required control; the schema remains the validation authority. */
  required?: boolean;
  /** Options for `select` and `multiselect` fields. */
  options?: { label: string; value: string }[];
  /** Fixed currency shown by a `money` field; required by that field's usage contract. */
  currency?: string;
  /** Custom controls reuse this form's values, validation, errors and submission.
   * Associate the visible label using labelId and make the invalid target focusable.
   */
  render?: (props: CrudFieldRenderProps) => ReactNode;
}

export interface CrudFormProps<T> {
  /** The same Zod schema used server-side — client validation reuses it (DRY). */
  schema: z.ZodType<T>;
  /** Field layout. The schema validates; these describe how to render each input. */
  fields: CrudField[];
  /** API path to submit to, called through `apiCall` (never a raw `fetch`). */
  endpoint: string;
  method?: 'POST' | 'PUT';
  initialValues?: Record<string, unknown>;
  submitLabel?: string;
  onSuccess?: (data: unknown) => void;
  onCancel?: () => void;
  /** Lets a composition disable competing actions while this request is pending. */
  onSubmittingChange?: (submitting: boolean) => void;
  /** Field errors returned by a related transition, such as publishing this resource. */
  externalFieldErrors?: FieldErrors;
}

function flattenZodError(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_root';
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

function defaultValueFor(field: CrudField): unknown {
  if (field.type === 'multiselect') return [];
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return '';
  return '';
}

interface LocalDateTimeInstant {
  getTime: () => number;
  toISOString: () => string;
  getFullYear: () => number;
  getMonth: () => number;
  getDate: () => number;
  getHours: () => number;
  getMinutes: () => number;
  getTimezoneOffset: () => number;
}

type ParseLocalDateTime = (value: string) => LocalDateTimeInstant;
type InstantFromTimestamp = (value: number) => LocalDateTimeInstant;

interface LocalWallClock {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

function parseLocalWallClock(value: string): LocalWallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hours: Number(match[4]),
    minutes: Number(match[5]),
  };
}

function sameLocalWallClock(instant: LocalDateTimeInstant, wallClock: LocalWallClock): boolean {
  return [
    [instant.getFullYear(), wallClock.year],
    [instant.getMonth() + 1, wallClock.month],
    [instant.getDate(), wallClock.day],
    [instant.getHours(), wallClock.hours],
    [instant.getMinutes(), wallClock.minutes],
  ].every(([actual, expected]) => actual === expected);
}

function isAmbiguousLocalWallClock(
  instant: LocalDateTimeInstant,
  wallClock: LocalWallClock,
  fromTimestamp: InstantFromTimestamp,
): boolean {
  const timestamp = instant.getTime();
  const offset = instant.getTimezoneOffset();
  const adjacentOffsets = new Set([
    fromTimestamp(timestamp - 24 * 60 * 60 * 1000).getTimezoneOffset(),
    fromTimestamp(timestamp + 24 * 60 * 60 * 1000).getTimezoneOffset(),
  ]);
  for (const adjacentOffset of adjacentOffsets) {
    if (adjacentOffset === offset) continue;
    const alternative = fromTimestamp(timestamp + (adjacentOffset - offset) * 60 * 1000);
    if (alternative.getTime() !== timestamp && sameLocalWallClock(alternative, wallClock)) return true;
  }
  return false;
}

/**
 * Converts the browser's local wall-clock representation to the UTC instant sent to
 * the API. Invalid and non-string values remain untouched so the shared schema can
 * report the field error instead of the form replacing the user's input.
 */
export function localDateTimeToUtc(
  value: unknown,
  parseLocalDateTime: ParseLocalDateTime = (localValue) => new Date(localValue),
  fromTimestamp: InstantFromTimestamp = (timestamp) => new Date(timestamp),
): unknown {
  if (typeof value !== 'string' || value === '') return value;
  const wallClock = parseLocalWallClock(value);
  if (wallClock === null) return value;
  const instant = parseLocalDateTime(value);
  if (Number.isNaN(instant.getTime()) || !sameLocalWallClock(instant, wallClock)) return value;
  return isAmbiguousLocalWallClock(instant, wallClock, fromTimestamp)
    ? value
    : instant.toISOString();
}

const fieldClassName = 'dm-input w-full';

/**
 * Schema-driven create/edit form. Validates client-side with the same Zod schema the
 * server uses, submits through `apiCall`, and shows server-returned `fieldErrors` next
 * to the right field. `Cmd/Ctrl+Enter` submits, `Escape` cancels. Use for every
 * create/edit screen; write a bespoke form only when the UX isn't form-over-schema.
 */
export function CrudForm<T>({
  schema,
  fields,
  endpoint,
  method = 'POST',
  initialValues,
  submitLabel = 'Save',
  onSuccess,
  onCancel,
  onSubmittingChange,
  externalFieldErrors,
}: CrudFormProps<T>) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const focusError = useRef(false);
  const pending = useRef(false);
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      const value = initialValues?.[field.name] ?? defaultValueFor(field);
      initial[field.name] = field.type === 'money' ? String(value) : value;
    }
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timeZone, setTimeZone] = useState<string | null>(null);

  useEffect(() => {
    if (fields.some((field) => field.type === 'datetime')) {
      const browserTimeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      queueMicrotask(() => setTimeZone(browserTimeZone));
    }
  }, [fields]);

  useEffect(() => {
    if (!focusError.current) return;
    focusError.current = false;
    const target = formRef.current!.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? formRef.current!.querySelector<HTMLElement>('[data-form-error]');
    target?.focus();
  }, [fieldErrors, formError]);

  useEffect(() => {
    if (!externalFieldErrors || !Object.values(externalFieldErrors).some((errors) => errors.length > 0)) return;
    const target = formRef.current!.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? formRef.current!.querySelector<HTMLElement>('[data-form-error]');
    target?.focus();
  }, [externalFieldErrors]);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const submit = useCallback(async () => {
    if (pending.current) return;
    setFormError(null);
    // Coerce empty number inputs to undefined so the schema's own rules apply.
    const candidate: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name];
      candidate[field.name] =
        field.type === 'number' && raw === ''
          ? undefined
          : field.type === 'datetime'
            ? localDateTimeToUtc(raw)
            : raw;
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      focusError.current = true;
      setFieldErrors(flattenZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    pending.current = true;
    setSubmitting(true);
    try {
      onSubmittingChange?.(true);
      const result = await apiCall(endpoint, { method, body: parsed.data });
      if (result.ok) {
        onSuccess?.(result.data);
      } else if (result.error.fieldErrors) {
        focusError.current = true;
        setFieldErrors(result.error.fieldErrors);
      } else {
        focusError.current = true;
        setFormError(result.error.message);
      }
    } catch {
      focusError.current = true;
      setFormError('We could not complete the request. Try again; your entries are still here.');
    } finally {
      pending.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
  }, [endpoint, fields, method, onSuccess, onSubmittingChange, schema, values]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape' && onCancel) {
        event.preventDefault();
        if (!pending.current) onCancel();
      }
    },
    [onCancel, submit],
  );

  return (
    <form
      ref={formRef}
      className="dm-form"
      aria-busy={submitting}
      noValidate
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {fields.map((field) => {
        const errors = fieldErrors[field.name] ?? externalFieldErrors?.[field.name];
        const value = values[field.name];
        const id = `${formId}-${field.name}`;
        const errorId = `${id}-errors`;
        const descriptionId = `${id}-description`;
        const description = field.type === 'datetime'
          ? [field.description, `Times use ${timeZone ?? 'your current timezone'}.`].filter(Boolean).join(' ')
          : field.type === 'money'
            ? [field.description, `Currency: ${field.currency}.`].filter(Boolean).join(' ')
            : field.description;
        const inputProps = {
          id,
          name: field.name,
          disabled: submitting,
          required: field.required,
          autoComplete: field.autoComplete,
          'aria-required': Boolean(field.required),
          'aria-invalid': Boolean(errors?.length),
          'aria-describedby': [description && descriptionId, errors?.length && errorId].filter(Boolean).join(' ') || undefined,
        };
        return (
          <div key={field.name} className="dm-field">
            <Label id={`${id}-label`} htmlFor={field.type === 'multiselect' ? undefined : id}>
              {field.label}
              {field.required && <span className="dm-field-required" aria-hidden="true"> *</span>}
            </Label>

            {field.render ? field.render({ inputProps, labelId: `${id}-label`, value, onChange: value => setValue(field.name, value) }) : field.type === 'textarea' ? (
              <Textarea
                {...inputProps}
                className="w-full"
                placeholder={field.placeholder}
                value={String(value ?? '')}
                onChange={(event) => setValue(field.name, event.target.value)}
              />
            ) : field.type === 'checkbox' ? (
              <input
                {...inputProps}
                type="checkbox"
                className="dm-checkbox"
                checked={Boolean(value)}
                onChange={(event) => setValue(field.name, event.target.checked)}
              />
            ) : field.type === 'multiselect' ? (
              <fieldset
                id={id}
                disabled={submitting}
                aria-labelledby={`${id}-label`}
                aria-invalid={inputProps['aria-invalid']}
                aria-describedby={inputProps['aria-describedby']}
                tabIndex={-1}
                className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
              >
                {field.options?.map((option) => {
                  const selected = Array.isArray(value) ? value : [];
                  const optionId = `${id}-${option.value}`;
                  return (
                    <label key={option.value} htmlFor={optionId} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        id={optionId}
                        name={field.name}
                        value={option.value}
                        checked={selected.includes(option.value)}
                        onCheckedChange={(checked) => setValue(
                          field.name,
                          checked === true
                            ? [...selected, option.value]
                            : selected.filter((selectedValue) => selectedValue !== option.value),
                        )}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            ) : field.type === 'select' ? (
              <select
                {...inputProps}
                className={fieldClassName}
                value={String(value ?? '')}
                onChange={(event) => setValue(field.name, event.target.value)}
              >
                <option value="" disabled>
                  {field.placeholder ?? 'Select…'}
                </option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.type === 'money' ? (
              <div className="relative">
                <Input
                  {...inputProps}
                  type="text"
                  inputMode="decimal"
                  className="w-full pr-16"
                  placeholder={field.placeholder}
                  value={String(value)}
                  onChange={(event) => setValue(field.name, event.target.value)}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground"
                >
                  {field.currency}
                </span>
              </div>
            ) : (
              <Input
                {...inputProps}
                type={field.type === 'number' ? 'number' : field.type === 'datetime' ? 'datetime-local' : field.type ?? 'text'}
                className="w-full"
                placeholder={field.placeholder}
                value={String(value ?? '')}
                onChange={(event) =>
                  setValue(
                    field.name,
                    field.type === 'number'
                      ? event.target.value === ''
                        ? ''
                        : Number(event.target.value)
                      : event.target.value,
                  )
                }
              />
            )}

            {description && <p id={descriptionId} className="dm-field-description">{description}</p>}

            {errors?.length ? (
              <div id={errorId} role="alert">
                {errors.map((message) => (
                  <p key={message} className="dm-field-error">
                    {message}
                  </p>
                ))
                }
              </div>
            ) : null}
          </div>
        );
      })}

      {(fieldErrors._root ?? externalFieldErrors?._root)?.length ? <div role="alert" tabIndex={-1} data-form-error className="dm-form-error">
        {(fieldErrors._root ?? externalFieldErrors?._root)!.map((message) => <p key={message}>{message}</p>)}
      </div> : null}
      {formError ? <p role="alert" tabIndex={-1} data-form-error className="dm-form-error">{formError}</p> : null}

      <div className="dm-form-actions">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
