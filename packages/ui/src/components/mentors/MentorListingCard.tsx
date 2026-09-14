import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { LocalTime } from '../../time/LocalTime';
import { MentorIdentity } from './MentorProfileCard';
import { TechnologyChips } from './TechnologyChips';

export interface MentorListingCardProps {
  name: string;
  headline: string;
  initials: string;
  stacks: string[];
  /** Already formatted with its currency by the host — money formatting is not this card's job. */
  price25: string;
  price50: string;
  /** The next bookable instant, or `null` when the mentor has published none. */
  nextAvailableAt: string | null;
  profileHref: string;
}

/**
 * One mentor in the public list (#20).
 *
 * Deliberately **not** `MentorProfileCard`: that one is the mentor's own card and carries a
 * draft/published status chip, which is a private workflow state, and no price. This one
 * carries what a mentee choosing between mentors compares — the stacks, both prices and the
 * next available time.
 *
 * It shows no rating (N02), no score and no featured treatment, and the list around it has
 * no search box (R13). The two prices are separate neutral chips rather than one
 * dot-separated line, per the design-system rule on comparable facts.
 */
export function MentorListingCard({
  name,
  headline,
  initials,
  stacks,
  price25,
  price50,
  nextAvailableAt,
  profileHref,
}: MentorListingCardProps) {
  return <Card className="dm-product-panel">
    <MentorIdentity name={name} headline={headline} initials={initials} />
    <TechnologyChips stacks={stacks} />
    <div className="dm-fact-chips" role="group" aria-label="Session prices">
      <Badge variant="outline">25 min: {price25}</Badge>
      <Badge variant="outline">50 min: {price50}</Badge>
    </div>
    <p className="dm-product-muted">
      {nextAvailableAt === null
        ? 'No upcoming times'
        : <>Next available <LocalTime value={nextAvailableAt} /></>}
    </p>
    <div className="dm-product-actions">
      <Button asChild appearance="stroke" intent="neutral">
        <a href={profileHref}>View {name}</a>
      </Button>
    </div>
  </Card>;
}
