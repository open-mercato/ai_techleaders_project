import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { EmptyState } from '../../backend/feedback/EmptyState';
import { MentorProfileCard, MentorDirectory } from './MentorProfileCard';
import { MentorRatingSummary, MentorReviewForm, MentorReviews, type MentorReview } from './MentorReviews';
import { TechnologyChips } from './TechnologyChips';

const demoReviews: MentorReview[] = [
  { id: 'demo-1', reviewerName: 'Taylor Chen', rating: 5, createdAt: '2026-09-06', dateLabel: '6 September 2026', text: 'Alex helped me narrow a confusing TypeScript error down to one boundary. I left with a smaller example and an explanation I could use in my own code.' },
  { id: 'demo-2', reviewerName: 'Morgan Blake', rating: 4, createdAt: '2026-09-04', dateLabel: '4 September 2026', text: 'The trade-offs were clear and the written answer was useful. I would book a longer session next time to leave more room for follow-up questions.' },
  { id: 'demo-3', reviewerName: 'Casey Rivera', rating: 5, createdAt: '2026-09-01', dateLabel: '1 September 2026', text: 'We worked through my API design question together. The examples made the decision easier to explain to my team.' },
];

const meta = {
  title: 'Product/Mentors', component: MentorProfileCard, tags: ['autodocs'],
  args: { name: 'Alex Laurent', headline: 'Staff engineer: developer tooling', initials: 'AL', introduction: 'I help developers design TypeScript APIs, decide what to test and keep their architecture maintainable. Bring a specific question and the context behind it.', stacks: ['TypeScript', 'React', 'Node.js'], publicWork: [{ label: 'Open source contributions', href: 'https://example.com/alex/work' }, { label: 'Technical writing', href: 'https://example.com/alex/writing' }], availability: 'Next available Wednesday, 9 September', status: 'published', actions: <Button>Choose a time</Button> },
  parameters: { layout: 'padded', docs: { description: { component: 'Mentor identity, technology icons, ratings and written reviews. All people and reviews shown here are fictional. The single-stack directory is planned for #20; it does not add ranking or search. The host checks whether a completed session is eligible for a review and saves submissions.' } } },
} satisfies Meta<typeof MentorProfileCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Published: Story = { args: { rating: { average: 14 / 3, reviewCount: 3 } } };
export const Draft: Story = { args: { status: 'draft', availability: 'No sessions published', actions: <Button intent="neutral" appearance="stroke">Complete profile</Button> } };
export const Incomplete: Story = { args: { status: 'incomplete', publicWork: [], availability: 'Add a public-work link and both session prices before publishing', actions: <Button>Edit profile</Button> } };
export const LongContent: Story = { args: { name: 'Alexandra Kowalska-Laurent', headline: 'Principal engineer working across developer experience and distributed systems', stacks: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Distributed systems'], availability: 'No bookable sessions at the moment', actions: <Button disabled>Choose a time</Button> } };

export const WithRating: Story = { args: { rating: { average: 14 / 3, reviewCount: 3 } }, parameters: { docs: { description: { story: 'Fictional demo average: ratings 5, 4 and 5 produce 4.7 from three reviews. Omit rating for legacy profiles, or use reviewCount: 0 for an explicit unrated state.' } } } };
export const Reviews: Story = { render: () => <div className="dm-product-panel"><p className="dm-product-caption">Fictional demo reviews. These are not real customer testimonials.</p><MentorRatingSummary average={14 / 3} reviewCount={3} /><MentorReviews reviews={demoReviews} /></div> };
export const NoReviews: Story = { render: () => <div className="dm-product-panel"><MentorRatingSummary average={0} reviewCount={0} /><MentorReviews reviews={[]} /></div> };
export const TechnologyIcons: Story = { render: () => <TechnologyChips stacks={['TypeScript', 'React', 'Python', 'Django', 'Docker', 'Go', 'Next.js', 'Node.js', 'PostgreSQL', 'API design', 'Other technology']} />, parameters: { docs: { description: { story: 'Technology chips and catalogue filters share local SVG marks. Labels stay visible, and decorative icons are hidden from screen readers. Unknown technologies use a code symbol.' } } } };

function ReviewFormExample({ fail = false }: { fail?: boolean }) {
  const [saved, setSaved] = useState(false);
  return <div className="dm-product-panel"><p className="dm-product-caption">Fictional completed session. This example stays in Storybook and publishes nothing.</p>{saved
    ? <p className="dm-product-callout" role="status">Your demo review was saved locally.</p>
    : <MentorReviewForm mentorName="Alex Laurent" onSubmit={async () => { await new Promise(resolve => setTimeout(resolve, 700)); if (fail) throw new Error('Demo save failed'); setSaved(true); }} />}</div>;
}
export const WriteAReview: Story = { render: () => <ReviewFormExample />, parameters: { docs: { description: { story: 'The host shows this form after an eligible completed session. Choose 1 to 5 stars with the native radio group and write a review. Submit an empty form to see required-field errors, or complete it to see the saving and success states.' } } } };
export const ReviewSaveError: Story = { render: () => <ReviewFormExample fail />, parameters: { docs: { description: { story: 'Complete the form and submit it to see a save error. Your rating and text stay in the form so you can try again.' } } } };

function DirectoryExample({ empty = false }: { empty?: boolean }) {
  const [selectedStack, setSelectedStack] = useState<string | null>(null);
  const visible = !empty && selectedStack !== 'Python';
  return <MentorDirectory stacks={['TypeScript', 'React', 'Python']} selectedStack={selectedStack} onStackChange={setSelectedStack} resultCount={visible ? 1 : 0} empty={<EmptyState title="No mentors with this stack right now" description="Choose another stack or check back for new availability." action={<Button intent="neutral" appearance="stroke" onClick={() => setSelectedStack(null)}>Clear filter</Button>} />}>
    <MentorProfileCard {...meta.args} />
  </MentorDirectory>;
}
export const Directory: Story = { render: () => <DirectoryExample />, parameters: { docs: { description: { story: 'Later 1.1: choose Python to see the empty result/recovery state. This local data example preserves input order.' } } } };
export const NoDirectoryResults: Story = { render: () => <DirectoryExample empty /> };
