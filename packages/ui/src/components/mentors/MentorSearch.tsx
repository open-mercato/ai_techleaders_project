'use client';

import { useId, useRef, useState } from 'react';
import { ArrowUpRight, CalendarDays, Globe2, Search, SlidersHorizontal, X } from 'lucide-react';
import { EmptyState } from '../../backend/feedback/EmptyState';
import { FormField } from '../../backend/forms/FormField';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { MentorRatingSummary } from './MentorReviews';
import { TechnologyChips, TechnologyIcon } from './TechnologyChips';
import { availableTimeLabel, mentorTechnologies, searchMentors, type MentorListing, type MentorSearchFilters } from './mentor-search';

export type { MentorListing } from './mentor-search';

export interface MentorSearchProps {
  mentors: MentorListing[];
  /** An ISO timestamp supplied by the host; demo examples use a fixed clock. */
  now: string;
  onViewProfile: (id: string) => void;
  initialQuery?: string;
}

export function MentorSearch({ mentors, now, onViewProfile, initialQuery = '' }: MentorSearchProps) {
  const id = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [stack, setStack] = useState<string | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [nextSevenDays, setNextSevenDays] = useState(false);
  const [sort, setSort] = useState<MentorSearchFilters['sort']>('availability');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const results = searchMentors(mentors, { query, stack, maxPrice, nextSevenDays, sort }, now);
  const hasFilters = Boolean(query.trim() || stack || maxPrice || nextSevenDays);

  function clearFilters() {
    setQuery('');
    setStack(null);
    setMaxPrice(null);
    setNextSevenDays(false);
    searchInput.current!.focus();
  }

  const appliedFilters: { label: string; clear: () => void; technology?: string }[] = [
    ...(query.trim() ? [{ label: `Search: ${query.trim()}`, clear: () => setQuery('') }] : []),
    ...(stack ? [{ label: stack, technology: stack, clear: () => setStack(null) }] : []),
    ...(maxPrice ? [{ label: `Up to PLN ${maxPrice} / 25 min`, clear: () => setMaxPrice(null) }] : []),
    ...(nextSevenDays ? [{ label: 'Within 7 days', clear: () => setNextSevenDays(false) }] : []),
  ];

  return <section className="dm-mentor-search" aria-labelledby={`${id}-title`}>
    <header className="dm-mentor-search-heading">
      <p className="dm-mentor-search-eyebrow">Mentor catalogue</p>
      <h2 id={`${id}-title`}>Find a mentor</h2>
      <p>Get help with the code, question or decision in front of you.</p>
    </header>

    <div role="search" aria-label="Find mentors" className="dm-mentor-search-controls">
      <div className="dm-mentor-search-query-row">
        <FormField label="Search mentors" description="Try a name, technology or topic, such as React testing.">
          {control => <div className="dm-mentor-search-input"><Search aria-hidden="true" /><Input {...control} ref={searchInput} type="search" placeholder="Try React testing" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" /></div>}
        </FormField>
        <Button type="button" className="dm-mentor-search-toggle" intent="neutral" appearance="stroke" aria-expanded={filtersOpen} aria-controls={`${id}-filters`} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal aria-hidden="true" />Filters</Button>
        <div id={`${id}-filters`} className="dm-mentor-search-filter-group" data-open={filtersOpen}>
          <div className="dm-mentor-search-filters">
            <FormField label="Price for 25 minutes">
              {control => <select {...control} className="dm-mentor-search-select" value={maxPrice ?? ''} onChange={event => setMaxPrice(event.target.value ? Number(event.target.value) : null)}>
                <option value="">Any price</option><option value="150">Up to PLN 150</option><option value="250">Up to PLN 250</option><option value="400">Up to PLN 400</option>
              </select>}
            </FormField>
            <FormField label="Availability">
              {control => <select {...control} className="dm-mentor-search-select" value={nextSevenDays ? 'week' : 'any'} onChange={event => setNextSevenDays(event.target.value === 'week')}>
                <option value="any">Any time</option><option value="week">Within 7 days</option>
              </select>}
            </FormField>
          </div>
          <fieldset className="dm-mentor-search-stacks">
            <legend>Technology</legend>
            <div>
              <Button type="button" intent={stack === null ? 'primary' : 'neutral'} appearance="stroke" aria-pressed={stack === null} onClick={() => setStack(null)}>All technologies</Button>
              {mentorTechnologies(mentors).map(technology => <Button key={technology} type="button" intent={stack === technology ? 'primary' : 'neutral'} appearance="stroke" leadingIcon={<TechnologyIcon stack={technology} />} aria-pressed={stack === technology} onClick={() => setStack(stack === technology ? null : technology)}>{technology}</Button>)}
            </div>
          </fieldset>
        </div>
      </div>
    </div>

    {hasFilters && <div className="dm-mentor-search-applied" role="group" aria-label="Applied filters">
      {appliedFilters.map(filter => <Button key={filter.label} type="button" intent="neutral" appearance="stroke" leadingIcon={filter.technology ? <TechnologyIcon stack={filter.technology} /> : undefined} aria-label={`Remove ${filter.label}`} onClick={() => { filter.clear(); searchInput.current!.focus(); }}>{filter.label}<X aria-hidden="true" /></Button>)}
      <Button type="button" intent="neutral" appearance="ghost" onClick={clearFilters}>Clear all filters</Button>
    </div>}

    <div className="dm-mentor-search-results-heading">
      <p role="status" aria-live="polite" aria-atomic="true"><strong>{results.length}</strong> {results.length === 1 ? 'mentor' : 'mentors'} found</p>
      <FormField label="Sort by">
        {control => <select {...control} className="dm-mentor-search-select" value={sort} onChange={event => setSort(event.target.value as MentorSearchFilters['sort'])}>
          <option value="availability">Next available</option><option value="price">Price: low to high</option>
        </select>}
      </FormField>
    </div>

    {results.length === 0
      ? <EmptyState className="dm-mentor-search-empty" icon={<Search />} title={hasFilters ? 'No mentors match these filters' : 'No mentors to show yet'} description={hasFilters ? 'Try a broader topic or remove a filter. Your search is still here.' : 'Profiles will appear here when mentors join the catalogue.'} action={hasFilters ? <Button type="button" intent="neutral" appearance="stroke" onClick={clearFilters}>Reset search</Button> : undefined} />
      : <ul className="dm-mentor-search-results" aria-label="Mentors">{results.map(mentor => {
        const nextTime = availableTimeLabel(mentor, now);
        return <li key={mentor.id}><article className="dm-mentor-search-card" aria-label={mentor.name}>
          <header><span className="dm-mentor-search-avatar" aria-hidden="true">{mentor.initials}</span><div><h3>{mentor.name}</h3><p>{mentor.headline}</p></div></header>
          <MentorRatingSummary average={mentor.averageRating} reviewCount={mentor.reviewCount} />
          <p className="dm-mentor-search-introduction">{mentor.introduction}</p>
          <TechnologyChips stacks={mentor.stacks} />
          <div className="dm-mentor-search-meta">
            <p><Globe2 aria-hidden="true" /><span>{mentor.languages.join(', ')}</span></p>
            <p><CalendarDays aria-hidden="true" /><span>{nextTime ? <>Next: <time dateTime={mentor.nextAvailableAt!}>{nextTime}</time></> : 'No upcoming times'}</span></p>
          </div>
          <footer><div className="dm-fact-chips" role="group" aria-label="Session prices"><Badge variant="outline">25 min: PLN {mentor.price25}</Badge><Badge variant="outline">50 min: PLN {mentor.price50}</Badge></div><Button type="button" appearance="stroke" onClick={() => onViewProfile(mentor.id)} aria-label={`View ${mentor.name}'s profile`}>View profile<ArrowUpRight aria-hidden="true" /></Button></footer>
        </article></li>;
      })}</ul>}
  </section>;
}
