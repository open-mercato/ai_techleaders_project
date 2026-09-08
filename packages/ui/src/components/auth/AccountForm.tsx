'use client';

import { useState, type ReactNode } from 'react';
import type { z } from 'zod';
import { CodeXml } from 'lucide-react';
import { CrudForm, type CrudField } from '../../backend/forms/CrudForm';
import { Button } from '../ui/button';

export interface AccountFormProps {
  mode: 'sign-in' | 'register';
  /** Validation and authentication policy belong to the host. */
  schema: z.ZodType<unknown>;
  endpoint: string;
  initialValues?: Record<string, unknown>;
  onSuccess: (data: unknown) => void;
  onGitHub: () => void;
  onSwitchMode: () => void;
  notice?: ReactNode;
  /** Keep GitHub available when email authentication is disabled by the host. */
  emailDisabled?: boolean;
}

export function AccountForm({
  mode, schema, endpoint, initialValues, onSuccess, onGitHub, onSwitchMode, notice,
  emailDisabled = false,
}: AccountFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const registering = mode === 'register';
  const fields: CrudField[] = [
    ...(registering ? [{ name: 'displayName', label: 'Display name', required: true, autoComplete: 'nickname' }] : []),
    { name: 'email', label: 'Email address', type: 'email', required: true, autoComplete: 'email' },
    {
      name: 'password', label: 'Password', type: 'password', required: true,
      autoComplete: registering ? 'new-password' : 'current-password',
      description: registering ? 'Use at least 12 characters.' : undefined,
    },
  ];

  return <div className="dm-account-form">
    {notice}
    <Button type="button" intent="neutral" appearance="stroke" className="dm-account-provider"
      leadingIcon={<CodeXml aria-hidden="true" />} onClick={onGitHub} disabled={submitting}>Continue with GitHub</Button>
    <div className="dm-account-divider" aria-hidden="true">or use your email</div>
    <fieldset className="dm-account-email" disabled={emailDisabled}>
      <legend className="dm-account-legend">{registering ? 'Create an account with email' : 'Sign in with email'}</legend>
      {emailDisabled && <p role="status" className="dm-account-email-unavailable">Email sign-in and registration are currently unavailable. Continue with GitHub to use your account.</p>}
      <CrudForm key={mode} schema={schema} fields={fields} endpoint={endpoint} initialValues={initialValues}
        submitLabel={registering ? 'Create account' : 'Sign in'} onSuccess={onSuccess} onSubmittingChange={setSubmitting} />
    </fieldset>
    <p className="dm-account-switch">
      <span>{registering ? 'Already have an account?' : 'New to DevMentor?'}</span>
      <Button type="button" variant="link" onClick={onSwitchMode} disabled={submitting}>{registering ? 'Sign in' : 'Create account'}</Button>
    </p>
  </div>;
}
