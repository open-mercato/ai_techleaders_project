'use client';

import { z } from 'zod';
import { CrudForm, type CrudField, type CrudFieldRenderProps } from '../../backend/forms/CrudForm';
import { TechnologyIcon } from './TechnologyChips';

export interface MentorProfileValues {
  displayName: string;
  description: string;
  publicWorkUrl: string;
  stacks: string[];
}

export interface MentorProfileEditorProps {
  initialValues: MentorProfileValues;
  endpoint: string;
  onSaved: (data: unknown) => void;
  onCancel: () => void;
  onSubmittingChange?: (submitting: boolean) => void;
}

const offeredStacks = ['TypeScript', 'React', 'Python', 'AI agents'] as const;
const stackSchema = z.enum(offeredStacks);
const schema = z.object({
  displayName: z.string().trim().min(1, 'Enter the name people should see.').max(120, 'Keep your name within 120 characters.'),
  description: z.string().trim().min(1, 'Describe the problems you can help with.').max(2000, 'Keep your description within 2,000 characters.'),
  publicWorkUrl: z.string().trim().pipe(z.url({ protocol: /^https?$/, error: 'Add a full public link starting with https:// or http://.' })),
  stacks: z.array(z.string()).min(1, 'Choose at least one technology or topic.')
    .refine(stacks => stacks.every(stack => stackSchema.safeParse(stack).success), 'Choose TypeScript, React, Python or AI agents.'),
});

function StackPicker({ inputProps, labelId, value, onChange }: CrudFieldRenderProps) {
  const selected = value as string[];
  return <fieldset id={inputProps.id} className="dm-mentor-stack-picker" disabled={inputProps.disabled}
    aria-labelledby={labelId} aria-invalid={inputProps['aria-invalid']}
    aria-describedby={inputProps['aria-describedby']} tabIndex={-1}>
    {offeredStacks.map(stack => <label key={stack} className="dm-mentor-stack-choice">
      <input type="checkbox" name={inputProps.name} value={stack} checked={selected.includes(stack)}
        onChange={event => {
          const supported = selected.filter(item => offeredStacks.includes(item as typeof offeredStacks[number]));
          onChange(event.target.checked ? [...supported, stack] : supported.filter(item => item !== stack));
        }} />
      <TechnologyIcon stack={stack} />
      <span>{stack}</span>
    </label>)}
  </fieldset>;
}

const fields: CrudField[] = [
  { name: 'displayName', label: 'Display name', required: true, autoComplete: 'name', description: 'Use the name you want on your public mentor profile.' },
  { name: 'description', label: 'About your mentoring', type: 'textarea', required: true, placeholder: 'Describe a problem you can help someone solve.', description: 'Share the topics you know and the kind of help people can expect. Up to 2,000 characters.' },
  { name: 'publicWorkUrl', label: 'Public work link', required: true, autoComplete: 'url', placeholder: 'https://github.com/your-name', description: 'Link to a public repository, portfolio or technical article that shows your work.' },
  { name: 'stacks', label: 'Technologies and topics', required: true, description: 'Choose at least one. People will see these on your profile.', render: props => <StackPicker {...props} /> },
];

/** Saving validates and stores profile details. The host handles publication separately. */
export function MentorProfileEditor({ initialValues, endpoint, onSaved, onCancel, onSubmittingChange }: MentorProfileEditorProps) {
  return <div className="dm-mentor-profile-editor">
    <CrudForm schema={schema} fields={fields} endpoint={endpoint} method="PUT" initialValues={{ ...initialValues }}
      submitLabel="Save profile" onSuccess={onSaved} onCancel={onCancel} onSubmittingChange={onSubmittingChange} />
  </div>;
}
