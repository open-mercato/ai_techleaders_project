import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Clock3, Globe2 } from 'lucide-react';
import {
  Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, MentorRatingSummary, MentorSearch, TechnologyChips,
} from '@devmentor/ui';
import { PublicPage, Screen } from './Frame';
import { dateLabel, money, timeLabel } from './flow';
import { navigate } from './navigation';
import type { PrototypeMentor } from './mentors';
import './mentor-catalogue.css';

export function MentorCatalogueScreen({ mentors, now }: { mentors: PrototypeMentor[]; now: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const clickedButton = useRef<HTMLButtonElement | null>(null);
  const profileTrigger = useRef<HTMLButtonElement | null>(null);
  const profileTitle = useRef<HTMLHeadingElement>(null);
  const destination = useRef<string | null>(null);
  const leavingCatalogue = useRef(false);
  const mentor = mentors.find(item => item.id === selectedId);

  useEffect(() => {
    const closeOnNavigation = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 's19') {
        leavingCatalogue.current = true;
        destination.current = null;
        setOpen(false);
      }
    };
    document.addEventListener('devmentor:screen-change', closeOnNavigation);
    return () => document.removeEventListener('devmentor:screen-change', closeOnNavigation);
  }, []);

  function openProfile(id: string) {
    profileTrigger.current = clickedButton.current;
    destination.current = null;
    leavingCatalogue.current = false;
    setSelectedId(id);
    setOpen(true);
  }

  return <Screen id="s19" title="Mentor catalogue" description="Search by name, technology or topic, compare session prices and read a mentor's profile." refs={['#16', '#18', '#20']}
    note="Six fictional mentors for local search, filter and profile interactions. Availability uses 10 September 2026, 08:00 UTC. All times, prices and rating summaries are sample data. Alex Laurent has the complete booking and session flow; the other profiles return to the catalogue. Search state lasts for this visit and resets on reload. No requests are sent to a search service.">
    <PublicPage className="mentor-catalogue-page">
      <h1 className="sr-only">Mentor catalogue</h1>
      <div onClickCapture={event => {
        if (event.target instanceof Element) clickedButton.current = event.target.closest<HTMLButtonElement>('button');
      }}>
        <MentorSearch mentors={mentors} now={now} onViewProfile={openProfile} />
      </div>
    </PublicPage>

    <Dialog open={open} onOpenChange={setOpen}>
      {mentor && <DialogContent className="catalogue-profile-dialog" onOpenAutoFocus={event => {
        event.preventDefault();
        profileTitle.current?.focus();
      }} onCloseAutoFocus={event => {
        event.preventDefault();
        if (destination.current) navigate(destination.current);
        else if (!leavingCatalogue.current) profileTrigger.current?.focus();
      }}>
        <DialogHeader className="catalogue-profile-header">
          <span className="catalogue-profile-avatar" aria-hidden="true">{mentor.initials}</span>
          <div><DialogTitle ref={profileTitle} tabIndex={-1}>{mentor.name}</DialogTitle><DialogDescription>{mentor.headline}</DialogDescription></div>
        </DialogHeader>

        <div className="catalogue-profile-content" role="region" aria-label={`${mentor.name} profile details`} tabIndex={0}>
          <div className="catalogue-profile-summary">
            <TechnologyChips stacks={mentor.stacks} />
            <MentorRatingSummary average={mentor.averageRating} reviewCount={mentor.reviewCount} />
          </div>
          <section className="catalogue-profile-section" aria-labelledby={`${mentor.id}-about`}>
            <h3 id={`${mentor.id}-about`}>About me</h3>
            {mentor.bio.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          </section>
          <section className="catalogue-profile-section" aria-labelledby={`${mentor.id}-help`}>
            <h3 id={`${mentor.id}-help`}>What I can help with</h3>
            <ul className="catalogue-profile-specialties">{mentor.specialties.map(specialty => <li key={specialty.title}><h4>{specialty.title}</h4><p>{specialty.description}</p></li>)}</ul>
          </section>
          <dl className="catalogue-profile-context">
            <div><dt><Globe2 aria-hidden="true" />Session languages</dt><dd>{mentor.languages.join(', ')}</dd></div>
            <div><dt><Clock3 aria-hidden="true" />Mentor timezone</dt><dd>{mentor.timeZone}</dd></div>
          </dl>
          <section className="catalogue-profile-section" aria-labelledby={`${mentor.id}-sessions`}>
            <h3 id={`${mentor.id}-sessions`}>Text sessions</h3>
            <div className="catalogue-profile-prices" role="group" aria-label="Session prices">
              <Badge variant="outline">25 minutes: {money(mentor.price25)}</Badge>
              <Badge variant="outline">50 minutes: {money(mentor.price50)}</Badge>
            </div>
            <p>A written answer and private session note are included.</p>
          </section>
          <section className="catalogue-profile-section" aria-labelledby={`${mentor.id}-times`}>
            <h3 id={`${mentor.id}-times`}><CalendarDays aria-hidden="true" />Published times</h3>
            {mentor.availableSlots.length > 0 ? <>
              <p>Times shown in {mentor.timeZone}.</p>
              <ul className="catalogue-profile-times">{mentor.availableSlots.map(slot => <li key={slot}><time dateTime={slot}><span>{dateLabel(slot, mentor.timeZone)}</span><strong>{timeLabel(slot, mentor.timeZone)}</strong></time></li>)}</ul>
            </> : <p>No times are published at the moment.</p>}
          </section>
        </div>

        <DialogFooter className="catalogue-profile-footer">
          <Button intent="neutral" appearance="stroke" onClick={() => setOpen(false)}>Back to results</Button>
          {mentor.id === 'alex-laurent' && <Button onClick={() => { destination.current = 's1'; setOpen(false); }}>View full profile<ArrowRight aria-hidden="true" /></Button>}
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  </Screen>;
}
