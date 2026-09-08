'use client';

import { useId, type ReactNode } from 'react';
import { Label } from '../../components/ui/label';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid': boolean;
  'aria-required': boolean;
}

export interface FormFieldProps {
  label: string;
  id?: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: (control: FormFieldControlProps) => ReactNode;
}

/** Associates a field's visible label, supporting text and error with its control. */
export function FormField({ label, id, description, error, required = false, children }: FormFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description && descriptionId, error && errorId].filter(Boolean).join(' ') || undefined;

  return <div className="dm-field">
    <Label htmlFor={controlId}>{label}{required && <span className="dm-field-required" aria-hidden="true"> *</span>}</Label>
    {children({ id: controlId, 'aria-describedby': describedBy, 'aria-invalid': Boolean(error), 'aria-required': required })}
    {description && <p id={descriptionId} className="dm-field-description">{description}</p>}
    {error && <p id={errorId} className="dm-field-error" role="alert">{error}</p>}
  </div>;
}
