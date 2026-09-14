'use client';

import { useId, type ReactNode } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { MentorRatingSummary, type MentorRatingSummaryProps } from './MentorReviews';
import { TechnologyChips } from './TechnologyChips';

export interface MentorIdentityProps {
  name: string;
  headline: string;
  initials: string;
  avatar?: ReactNode;
}

export function MentorIdentity({ name, headline, initials, avatar }: MentorIdentityProps) {
  return <div className="dm-mentor-identity">
    <span className="dm-mentor-avatar" aria-hidden="true">{avatar ?? initials}</span>
    <div><h3 className="dm-product-title">{name}</h3><p className="dm-product-muted">{headline}</p></div>
  </div>;
}

export interface MentorProfileCardProps extends MentorIdentityProps {
  introduction: string;
  stacks: string[];
  publicWork: { label: string; href: string }[];
  availability: string;
  status: 'draft' | 'incomplete' | 'published';
  rating?: MentorRatingSummaryProps;
  /** Caller supplies authorized navigation or a copy-link action with its own feedback. */
  actions: ReactNode;
}

export function MentorProfileCard({ introduction, stacks, publicWork, availability, status, actions, rating, ...identity }: MentorProfileCardProps) {
  return <Card className="dm-product-panel dm-mentor-profile">
    <div className="dm-product-row"><MentorIdentity {...identity} /><span className="dm-product-status" data-tone={status === 'published' ? 'success' : 'neutral'}>{status}</span></div>
    {rating && <MentorRatingSummary {...rating} />}
    <p className="dm-product-copy">{introduction}</p>
    <TechnologyChips stacks={stacks} />
    <ul className="dm-product-links" aria-label="Public work">{publicWork.map(work => <li key={work.href}><a href={work.href}>{work.label}<span aria-hidden="true"> ↗</span></a></li>)}</ul>
    <div className="dm-product-divider" />
    <p className="dm-product-muted dm-meta-stack"><span>Text mentoring sessions</span>{' '}<span>{availability}</span></p>
    <div className="dm-product-actions">{actions}</div>
  </Card>;
}

export interface MentorDirectoryProps {
  stacks: string[];
  selectedStack: string | null;
  onStackChange: (stack: string | null) => void;
  resultCount: number;
  /** Cards are provided already filtered and sorted by latest published availability. */
  children: ReactNode;
  empty: ReactNode;
}

export function MentorDirectory({ stacks, selectedStack, onStackChange, resultCount, children, empty }: MentorDirectoryProps) {
  const labelId = useId();
  return <section className="dm-product-stack" aria-labelledby={labelId}>
    <div><h2 id={labelId} className="dm-product-heading">Find a mentor</h2><p className="dm-product-muted">Filter by stack. Mentors with the most recently published availability appear first.</p></div>
    <div role="group" aria-label="Filter by stack" className="dm-product-actions">
      <Button appearance={selectedStack === null ? 'filled' : 'stroke'} intent={selectedStack === null ? 'primary' : 'neutral'} aria-pressed={selectedStack === null} onClick={() => onStackChange(null)}>All stacks</Button>
      {stacks.map(stack => <Button key={stack} appearance="stroke" intent={selectedStack === stack ? 'primary' : 'neutral'} aria-pressed={selectedStack === stack} onClick={() => onStackChange(stack)}>{stack}</Button>)}
    </div>
    <p className="dm-product-muted" role="status">{resultCount} {resultCount === 1 ? 'mentor' : 'mentors'} available</p>
    {resultCount === 0 ? empty : <div className="dm-product-grid">{children}</div>}
  </section>;
}
