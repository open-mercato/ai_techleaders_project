// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MentorSearch, type MentorListing } from './MentorSearch';

afterEach(cleanup);
const now = '2026-09-07T12:00:00Z';
const alex: MentorListing = {
  id: 'alex', name: 'Alex Laurent', initials: 'AL', headline: 'TypeScript APIs', introduction: 'Bring a small code example.',
  stacks: ['TypeScript', 'React'], topics: ['Testing', 'API design'], languages: ['English', 'French'], timeZone: 'Europe/Warsaw',
  price25: 180, price50: 360, averageRating: 14 / 3, reviewCount: 3, nextAvailableAt: '2026-09-08T12:00:00Z',
};
const eloise: MentorListing = { ...alex, id: 'eloise', name: 'Éloïse Łukasik', initials: 'EL', headline: 'Python data tooling', stacks: ['Python'], topics: ['Data modelling'], price25: 100, price50: 200, nextAvailableAt: null, reviewCount: 0, averageRating: 0 };
const morgan: MentorListing = { ...alex, id: 'morgan', name: 'Morgan Chen', initials: 'MC', headline: 'React interfaces', price25: 400, price50: 800, nextAvailableAt: '2026-09-10T10:00:00Z' };
const mentors = [morgan, eloise, alex];

function visibleNames() { return screen.queryAllByRole('article').map(article => article.getAttribute('aria-label')); }

it('shows comparable mentor cards, supplied availability, review states and correct profile destinations', () => {
  const onViewProfile = vi.fn();
  const { container } = render(<MentorSearch mentors={mentors} now={now} onViewProfile={onViewProfile} />);
  expect(screen.getByRole('status').textContent).toBe('3 mentors found');
  expect(visibleNames()).toEqual(['Alex Laurent', 'Morgan Chen', 'Éloïse Łukasik']);
  const card = screen.getByRole('article', { name: 'Alex Laurent' });
  expect(within(card).getByText('English, French')).toBeTruthy();
  expect(within(card).getByText('25 min: PLN 180')).toBeTruthy();
  expect(within(card).getByText('50 min: PLN 360')).toBeTruthy();
  expect(within(card).getByText('Tue 8 Sept, 14:00 CEST').getAttribute('datetime')).toBe(alex.nextAvailableAt);
  expect(within(card).getByText('4.7')).toBeTruthy();
  expect(screen.getByText('No reviews yet')).toBeTruthy();
  expect(screen.getByText('No upcoming times')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: "View Éloïse Łukasik's profile" }));
  expect(onViewProfile).toHaveBeenCalledExactlyOnceWith('eloise');
  expect(container.textContent).not.toMatch(/[·•]/);
});

it('searches live with normalized multiword terms and clears a query without losing focus', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} />);
  const input = screen.getByRole('searchbox', { name: 'Search mentors' });
  expect(input.getAttribute('aria-describedby')).toBe(screen.getByText('Try a name, technology or topic, such as React testing.').id);
  fireEvent.change(input, { target: { value: '  ELOISE lukasik  ' } });
  expect(visibleNames()).toEqual(['Éloïse Łukasik']);
  expect(screen.getByRole('status').textContent).toBe('1 mentor found');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Search: ELOISE lukasik' }));
  expect((input as HTMLInputElement).value).toBe('');
  expect(document.activeElement).toBe(input);
  expect(screen.queryByRole('group', { name: 'Applied filters' })).toBeNull();
  expect(visibleNames()).toHaveLength(3);
});

it('toggles a technology, switches technologies and returns to all technologies', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} />);
  const react = screen.getByRole('button', { name: 'React' });
  for (const [technology, slug] of [['TypeScript', 'typescript'], ['React', 'react'], ['Python', 'python']]) {
    const button = screen.getByRole('button', { name: technology });
    const icon = button.querySelector('svg')!;
    expect(icon.getAttribute('data-technology')).toBe(slug);
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(icon.getAttribute('focusable')).toBe('false');
  }
  fireEvent.click(react);
  expect(react.getAttribute('aria-pressed')).toBe('true');
  expect(visibleNames()).toEqual(['Alex Laurent', 'Morgan Chen']);
  fireEvent.click(react);
  expect(react.getAttribute('aria-pressed')).toBe('false');
  expect(visibleNames()).toHaveLength(3);
  fireEvent.click(screen.getByRole('button', { name: 'Python' }));
  expect(visibleNames()).toEqual(['Éloïse Łukasik']);
  fireEvent.click(screen.getByRole('button', { name: 'All technologies' }));
  expect(visibleNames()).toHaveLength(3);
});

it('combines filters and lets each applied filter be removed independently', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'API' } });
  fireEvent.click(screen.getByRole('button', { name: 'TypeScript' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Price for 25 minutes' }), { target: { value: '250' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Availability' }), { target: { value: 'week' } });
  expect(visibleNames()).toEqual(['Alex Laurent']);
  const applied = screen.getByRole('group', { name: 'Applied filters' });
  expect(within(applied).getAllByRole('button')).toHaveLength(5);
  expect(within(applied).getByRole('button', { name: 'Remove TypeScript' }).querySelector('[data-technology="typescript"]')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove TypeScript' }));
  expect(screen.getByRole('button', { name: 'All technologies' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Remove Up to PLN 250 / 25 min' }));
  expect(visibleNames()).toEqual(['Alex Laurent', 'Morgan Chen']);
  fireEvent.click(screen.getByRole('button', { name: 'Remove Within 7 days' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove Search: API' }));
  expect(screen.queryByRole('group', { name: 'Applied filters' })).toBeNull();
  expect(visibleNames()).toHaveLength(3);
});

it('supports native filter reset and sorting by an explicit price without clearing search', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} />);
  const price = screen.getByRole('combobox', { name: 'Price for 25 minutes' });
  const availability = screen.getByRole('combobox', { name: 'Availability' });
  fireEvent.change(price, { target: { value: '150' } });
  expect(visibleNames()).toEqual(['Éloïse Łukasik']);
  fireEvent.change(price, { target: { value: '' } });
  fireEvent.change(availability, { target: { value: 'week' } });
  expect(visibleNames()).toHaveLength(2);
  fireEvent.change(availability, { target: { value: 'any' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'price' } });
  expect(visibleNames()).toEqual(['Éloïse Łukasik', 'Alex Laurent', 'Morgan Chen']);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'React' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Sort by' }), { target: { value: 'availability' } });
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('React');
  expect(visibleNames()).toEqual(['Alex Laurent', 'Morgan Chen']);
});

it('preserves a zero-result query and resets all filters from either recovery action', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} initialQuery="Rust debugging" />);
  expect(screen.getByText('No mentors match these filters')).toBeTruthy();
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('Rust debugging');
  fireEvent.click(screen.getByRole('button', { name: 'Reset search' }));
  expect(visibleNames()).toHaveLength(3);
  expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Python' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Price for 25 minutes' }), { target: { value: '400' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Availability' }), { target: { value: 'week' } });
  expect(visibleNames()).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
  expect(visibleNames()).toHaveLength(3);
  expect((screen.getByRole('combobox', { name: 'Price for 25 minutes' }) as HTMLSelectElement).value).toBe('');
  expect((screen.getByRole('combobox', { name: 'Availability' }) as HTMLSelectElement).value).toBe('any');
});

it('distinguishes an empty catalogue and keeps multiple catalogue control IDs isolated', () => {
  render(<><MentorSearch mentors={[]} now={now} onViewProfile={vi.fn()} /><MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} /></>);
  expect(screen.getByText('No mentors to show yet')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Reset search' })).toBeNull();
  const inputs = screen.getAllByRole('searchbox');
  expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  fireEvent.change(inputs[0]!, { target: { value: 'React' } });
  expect((inputs[1]! as HTMLInputElement).value).toBe('');
  expect(visibleNames()).toHaveLength(3);
});

it('keeps selected filters and results when the compact filter disclosure is closed and reopened', () => {
  render(<MentorSearch mentors={mentors} now={now} onViewProfile={vi.fn()} />);
  const toggle = screen.getByRole('button', { name: 'Filters' });
  const region = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(region.getAttribute('data-open')).toBe('false');
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Python' }));
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(visibleNames()).toEqual(['Éloïse Łukasik']);
  expect(screen.getByRole('button', { name: 'Remove Python' })).toBeTruthy();
  fireEvent.click(toggle);
  expect(region.getAttribute('data-open')).toBe('true');
  expect(screen.getByRole('button', { name: 'Python' }).getAttribute('aria-pressed')).toBe('true');
});
