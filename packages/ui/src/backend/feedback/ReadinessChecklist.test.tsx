// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ReadinessChecklist } from './ReadinessChecklist';

afterEach(cleanup);

it('renders ordered, text-labelled states and actions only for unmet requirements', () => {
  render(<ReadinessChecklist items={[
    { key: 'publicWorkUrl', label: 'Add a link to your public work', met: true },
    { key: 'bio', label: 'Describe the work you have done', met: false },
    { key: 'stackTags', label: 'Choose at least one technology', met: false },
  ]} actionsByKey={{
    publicWorkUrl: <a href="#work">Change work link</a>,
    bio: <a href="#bio">Add bio</a>,
  }} />);

  expect(screen.getByRole('region', { name: 'Ready to publish?' })).toBeTruthy();
  expect(screen.getByText('Complete each requirement before publishing your mentor page.')).toBeTruthy();
  const items = screen.getAllByRole('listitem');
  expect(within(items[0]!).getByText('Complete')).toBeTruthy();
  expect(items[0]!.getAttribute('data-complete')).toBe('true');
  expect(within(items[0]!).queryByRole('link')).toBeNull();
  expect(within(items[1]!).getByText('Required')).toBeTruthy();
  expect(items[1]!.getAttribute('data-complete')).toBe('false');
  expect(within(items[1]!).getByRole('link', { name: 'Add bio' })).toBeTruthy();
  expect(within(items[2]!).getByText('3').getAttribute('aria-hidden')).toBe('true');
  expect(within(items[2]!).queryByRole('link')).toBeNull();
});

it('supports page-specific copy and an empty gate', () => {
  render(<ReadinessChecklist items={[]} title="Page complete" description="You can publish now." />);
  expect(screen.getByRole('region', { name: 'Page complete' })).toBeTruthy();
  expect(screen.getByText('You can publish now.')).toBeTruthy();
  expect(screen.getByText('No requirements to complete.')).toBeTruthy();
  expect(screen.queryByRole('list')).toBeNull();
});
