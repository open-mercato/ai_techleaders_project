'use client';

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { z } from 'zod';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { apiCall } from '../api/apiCall';
import type { FieldErrors } from '../api/types';

export type CrudFieldType = 'text' | 'email' | 'password' | 'number' | 'date' | 'datetime-local' | 'textarea' | 'checkbox' | 'select';

export interface CrudField {
  name: string;
  label: string;
  type?: CrudFieldType;
  placeholder?: string;
  /** Marks a required control; the schema remains the validation authority. */
  required?: boolean;
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
}: CrudFormProps<T>) {
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const focusError = useRef(false);
  const pending = useRef(false);
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

  useEffect(() => {
    if (!focusError.current) return;
    focusError.current = false;
    const target = formRef.current!.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?? formRef.current!.querySelector<HTMLElement>('[data-form-error]');
    target?.focus();
  }, [fieldErrors, formError]);

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
        field.type === 'number' && raw === '' ? undefined : raw;
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
    }
  }, [endpoint, fields, method, onSuccess, schema, values]);

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
        const errors = fieldErrors[field.name];
        const value = values[field.name];
        const id = `${formId}-${field.name}`;
        const errorId = `${id}-errors`;
        const inputProps = {
          id,
          name: field.name,
          disabled: submitting,
          required: field.required,
          'aria-required': Boolean(field.required),
          'aria-invalid': Boolean(errors?.length),
          'aria-describedby': errors?.length ? errorId : undefined,
        };
        return (
          <div key={field.name} className="dm-field">
            <Label htmlFor={id}>
              {field.label}
              {field.required && <span className="dm-field-required" aria-hidden="true"> *</span>}
            </Label>

            {field.type === 'textarea' ? (
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
            ) : (
              <Input
                {...inputProps}
                type={field.type === 'number' ? 'number' : field.type ?? 'text'}
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

      {fieldErrors._root?.length ? <div role="alert" tabIndex={-1} data-form-error className="dm-form-error">
        {fieldErrors._root.map((message) => <p key={message}>{message}</p>)}
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
