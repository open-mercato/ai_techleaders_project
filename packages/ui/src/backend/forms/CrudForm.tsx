'use client';

import { useCallback, useState, type KeyboardEvent } from 'react';
import type { z } from 'zod';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { apiCall } from '../api/apiCall';
import type { FieldErrors } from '../api/types';

export type CrudFieldType = 'text' | 'email' | 'number' | 'textarea' | 'checkbox' | 'select';

export interface CrudField {
  name: string;
  label: string;
  type?: CrudFieldType;
  placeholder?: string;
  /** Options for `select` fields. */
  options?: { label: string; value: string }[];
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
  if (field.type === 'checkbox') return false;
  if (field.type === 'number') return '';
  return '';
}

const fieldClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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
}: CrudFormProps<T>) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of fields) {
      initial[field.name] = initialValues?.[field.name] ?? defaultValueFor(field);
    }
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setValue = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const submit = useCallback(async () => {
    setFormError(null);
    // Coerce empty number inputs to undefined so the schema's own rules apply.
    const candidate: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name];
      candidate[field.name] =
        field.type === 'number' && raw === '' ? undefined : raw;
    }

    const parsed = schema.safeParse(candidate);
    if (!parsed.success) {
      setFieldErrors(flattenZodError(parsed.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    const result = await apiCall(endpoint, { method, body: parsed.data });
    setSubmitting(false);

    if (result.ok) {
      onSuccess?.(result.data);
      return;
    }
    if (result.error.fieldErrors) {
      setFieldErrors(result.error.fieldErrors);
    } else {
      setFormError(result.error.message);
    }
  }, [endpoint, fields, method, onSuccess, schema, values]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        void submit();
      } else if (event.key === 'Escape' && onCancel) {
        event.preventDefault();
        onCancel();
      }
    },
    [onCancel, submit],
  );

  return (
    <form
      className="flex flex-col gap-4"
      onKeyDown={onKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {fields.map((field) => {
        const errors = fieldErrors[field.name];
        const value = values[field.name];
        return (
          <div key={field.name} className="flex flex-col gap-1.5">
            <label htmlFor={field.name} className="text-sm font-medium">
              {field.label}
            </label>

            {field.type === 'textarea' ? (
              <textarea
                id={field.name}
                className={cn(fieldClassName, 'min-h-24')}
                placeholder={field.placeholder}
                value={String(value ?? '')}
                onChange={(event) => setValue(field.name, event.target.value)}
              />
            ) : field.type === 'checkbox' ? (
              <input
                id={field.name}
                type="checkbox"
                className="size-4"
                checked={Boolean(value)}
                onChange={(event) => setValue(field.name, event.target.checked)}
              />
            ) : field.type === 'select' ? (
              <select
                id={field.name}
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
            ) : (
              <input
                id={field.name}
                type={field.type === 'number' ? 'number' : field.type ?? 'text'}
                className={fieldClassName}
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

            {errors?.length
              ? errors.map((message) => (
                  <p key={message} className="text-xs text-destructive">
                    {message}
                  </p>
                ))
              : null}
          </div>
        );
      })}

      {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
