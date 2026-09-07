import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { MentorSearch, type MentorListing, type MentorSearchProps } from './MentorSearch';

const mentors: MentorListing[] = [
  { id: 'alex', name: 'Alex Laurent', initials: 'AL', headline: 'Staff engineer: developer tooling', introduction: 'I help with TypeScript APIs, test boundaries and changes that need to work with existing code.', stacks: ['TypeScript', 'React'], topics: ['API design', 'Testing'], languages: ['English', 'French'], timeZone: 'Europe/Warsaw', price25: 180, price50: 360, averageRating: 14 / 3, reviewCount: 3, nextAvailableAt: '2026-09-10T10:00:00Z' },
  { id: 'maya', name: 'Maya Okafor', initials: 'MO', headline: 'Frontend engineer: React applications', introduction: 'Bring a slow page or a difficult state update. We can work through what happens and what to change.', stacks: ['React', 'TypeScript'], topics: ['Performance', 'State management'], languages: ['English'], timeZone: 'Europe/London', price25: 150, price50: 300, averageRating: 4.5, reviewCount: 2, nextAvailableAt: '2026-09-08T13:00:00Z' },
  { id: 'eloise', name: 'Éloïse Martin', initials: 'EM', headline: 'Data engineer: Python and PostgreSQL', introduction: 'I review SQL queries and Python data jobs. Share the input, expected output and the part that has you stuck.', stacks: ['Python', 'PostgreSQL'], topics: ['SQL queries', 'Data modelling'], languages: ['English', 'French'], timeZone: 'Europe/Paris', price25: 220, price50: 440, averageRating: 0, reviewCount: 0, nextAvailableAt: null },
];

function CatalogueExample(args: MentorSearchProps) {
  const [selected, setSelected] = useState<string | null>(null);
  return <><p className="dm-product-caption">Fictional profiles and times. Demo clock: 7 September 2026, 12:00 UTC.</p><MentorSearch {...args} onViewProfile={id => setSelected(id)} />{selected && <p className="dm-product-callout" role="status">Selected demo profile: {mentors.find(mentor => mentor.id === selected)?.name}. The prototype opens the full profile.</p>}</>;
}

const meta = {
  title: 'Product/Mentor search', component: MentorSearch, tags: ['autodocs'],
  args: { mentors, now: '2026-09-07T12:00:00Z', onViewProfile: () => undefined },
  render: args => <CatalogueExample {...args} />,
  parameters: { layout: 'padded', docs: { description: { component: 'Search by name, technology or topic. Combine a technology with the 25-minute price limit and next-seven-days filter; remove filters individually or reset them together. Ordering uses the next upcoming slot or price, with name and ID tie-breaks. All profiles, ratings and times are fictional. The host supplies data, a clock and profile navigation. This design extension does not implement backend search or change the product delivery plan.' } } },
} satisfies Meta<typeof MentorSearch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Catalogue: Story = {};
export const SearchResults: Story = { args: { initialQuery: 'React' } };
export const NoMatches: Story = { args: { initialQuery: 'Rust compiler' } };
export const EmptyCatalogue: Story = { args: { mentors: [] } };
export const Mobile: Story = { parameters: { viewport: { defaultViewport: 'mobile1' } }, globals: { viewport: { value: 'mobile1', isRotated: false } } };
