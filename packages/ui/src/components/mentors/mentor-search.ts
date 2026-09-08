export interface MentorListing {
  id: string;
  name: string;
  initials: string;
  headline: string;
  introduction: string;
  stacks: string[];
  topics: string[];
  languages: string[];
  timeZone: string;
  price25: number;
  price50: number;
  averageRating: number;
  reviewCount: number;
  nextAvailableAt: string | null;
}

export interface MentorSearchFilters {
  query: string;
  stack: string | null;
  maxPrice: number | null;
  nextSevenDays: boolean;
  sort: 'availability' | 'price';
}

function normalize(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replaceAll('ł', 'l').trim().replace(/\s+/g, ' ');
}

const searchAliases = new Map([['ts', 'typescript'], ['js', 'javascript'], ['nodejs', 'node.js']]);

/** Expired, missing and malformed slots are never presented as bookable. */
export function upcomingTime(mentor: MentorListing, now: string): number {
  const time = Date.parse(mentor.nextAvailableAt ?? '');
  return Number.isFinite(time) && time >= Date.parse(now) ? time : Infinity;
}

export function searchMentors(mentors: MentorListing[], filters: MentorSearchFilters, now: string): MentorListing[] {
  const terms = normalize(filters.query).split(' ').filter(Boolean).map(term => searchAliases.get(term) ?? term);
  const end = Date.parse(now) + 7 * 24 * 60 * 60 * 1000;
  return mentors.filter(mentor => {
    const searchable = normalize([mentor.name, mentor.headline, mentor.introduction, ...mentor.stacks, ...mentor.topics].join(' '));
    return terms.every(term => searchable.includes(term))
      && (filters.stack === null || mentor.stacks.includes(filters.stack))
      && (filters.maxPrice === null || mentor.price25 <= filters.maxPrice)
      && (!filters.nextSevenDays || upcomingTime(mentor, now) <= end);
  }).sort((left, right) => {
    const order = filters.sort === 'price'
      ? left.price25 - right.price25
      : upcomingTime(left, now) - upcomingTime(right, now);
    return order || left.name.localeCompare(right.name, 'en') || left.id.localeCompare(right.id, 'en');
  });
}

export function mentorTechnologies(mentors: MentorListing[]): string[] {
  return [...new Set(mentors.flatMap(mentor => mentor.stacks))].sort((left, right) => left.localeCompare(right, 'en'));
}

export function availableTimeLabel(mentor: MentorListing, now: string): string | null {
  const time = upcomingTime(mentor, now);
  if (!Number.isFinite(time)) return null;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23', timeZone: mentor.timeZone, timeZoneName: 'short',
  }).format(time);
}
