import { ArrowRight, CalendarDays, Check, Clock3, FileCode2, FileText, Globe2, LockKeyhole, MessageSquare } from 'lucide-react';
import { Badge, Button, Card, MentorRatingSummary, MentorReviews, TechnologyChips, type MentorReview } from '@devmentor/ui';
import { EmptyState } from '@devmentor/ui/backend';
import type { MentorProfile } from './mentor-model';
import { useAuth } from './auth-context';
import { PublicPage, Screen } from './Frame';
import { money } from './flow';
import { navigate } from './navigation';
import './mentor-profile.css';

export interface MentorProfileScreenProps {
  prices: { 25: number; 50: number };
  reviews: MentorReview[];
  profile?: MentorProfile | null;
  bookable?: boolean;
}

export function MentorProfileScreen({ prices, reviews, profile, bookable = true }: MentorProfileScreenProps) {
  const auth = useAuth();
  if(profile===null) return <Screen id="s1" title="Mentor profile" description="Unpublished mentor pages are not visible to visitors." refs={['#16']}><PublicPage><div className="proto-narrow"><EmptyState title="This profile is not published" description="The mentor is still setting up their page. You can browse other mentors in the meantime." action={<Button onClick={()=>navigate(auth?.user?.roles.includes('mentor')?'s27':'s19')}>{auth?.user?.roles.includes('mentor')?'Back to profile editor':'Browse mentors'}</Button>}/></div></PublicPage></Screen>;
  const name=profile?.displayName??'Alex Laurent';
  const average = reviews.length === 0 ? 0 : reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;

  return <Screen id="s1" title="Mentor profile" description="Read about the mentor and their work, check reviews and choose a session." refs={['#16', '#18']} note="Local profile example. Alex Laurent, the biography, language and timezone details, work sample and initial reviews are fictional. Submitted reviews stay in this prototype. Availability uses the fixed demo clock. The sample answer expands inline and does not reveal private session content.">
    <PublicPage className="mentor-profile-page">
      <div className="mentor-profile-layout">
        <header className="mentor-profile-header">
          <div className="mentor-profile-identity">
            <span className="mentor-profile-avatar" aria-hidden="true">{name.split(' ').map(word=>word[0]).slice(0,2).join('')}</span>
            <div><p className="mentor-profile-eyebrow">Developer mentor</p><h1>{name}</h1><p className="mentor-profile-role">{profile ? profile.stacks.join(' / ') : 'Staff engineer specialising in TypeScript & React'}</p></div>
          </div>
          <p className="mentor-profile-intro">{profile?.description??'I help you understand what is going wrong in your code and choose a change you can explain.'}</p>
          <TechnologyChips stacks={profile?.stacks??['TypeScript', 'React', 'API design']} />
          <MentorRatingSummary average={average} reviewCount={reviews.length} />
          <dl className="mentor-profile-context">
            <div><dt><Globe2 aria-hidden="true" />Session language</dt><dd>English</dd></div>
            <div><dt><Clock3 aria-hidden="true" />Mentor timezone</dt><dd>Europe/Warsaw</dd></div>
          </dl>
        </header>

        <aside className="mentor-profile-booking" aria-labelledby="mentor-booking-title">
          <Card className="mentor-booking-card">
            <div className="mentor-booking-intro"><p className="mentor-profile-eyebrow">Book with {name}</p><h2 id="mentor-booking-title">Choose your session.</h2><p>Pick a session length based on how much you want to discuss.</p></div>
            {bookable ? <><dl className="mentor-profile-prices">
              <div><dt><strong>25 minutes</strong><span>A focused question</span></dt><dd>{money(prices[25])}</dd></div>
              <div><dt><strong>50 minutes</strong><span>More time for detail</span></dt><dd>{money(prices[50])}</dd></div>
            </dl>
            <div className="mentor-profile-availability"><p><CalendarDays aria-hidden="true" />Published availability</p><div className="dm-fact-chips" role="group" aria-label="Days with published sessions">{profile ? profile.slots.filter(slot=>!slot.blockedReason).length ? [...new Set(profile.slots.filter(slot=>!slot.blockedReason).map(slot=>new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'UTC'}).format(new Date(slot.start))))].map(day=><Badge key={day} variant="outline">{day}</Badge>) : <p>No times available right now.</p> : <><Badge variant="outline">Thursday</Badge><Badge variant="outline">Friday</Badge></>}</div></div>
            <Button className="mentor-profile-book-button" onClick={() => navigate('s3')}>Choose a session<ArrowRight aria-hidden="true" /></Button>
            <p className="mentor-booking-hint">See the available times in your timezone. Book at least 2 hours ahead.</p></> : <EmptyState title="Not bookable yet" description="This mentor still needs to set both session prices. Check back once their setup is complete."/>}
            <ul className="mentor-profile-included" aria-label="Included with your session">
              <li><MessageSquare aria-hidden="true" /><span>A conversation in text</span></li>
              <li><FileText aria-hidden="true" /><span>A written answer to keep</span></li>
              <li><LockKeyhole aria-hidden="true" /><span>A private session note</span></li>
            </ul>
          </Card>
        </aside>

        <div className="mentor-profile-content">
          {profile && <section className="mentor-profile-section"><h2>Public work</h2><a className="proto-inline-link" href={profile.publicWorkUrl} target="_blank" rel="noreferrer">View public work</a><p className="dm-product-caption">Work link provided by the mentor. This prototype uses fictional profiles.</p></section>}
          <section className="mentor-profile-section" aria-labelledby="mentor-about-title">
            <h2 id="mentor-about-title">About me</h2>
            <div className="mentor-profile-prose"><p>{profile?.description??'I work on API types, React component responsibilities and architecture choices that make code easier to change.'}</p></div>
          </section>

          {(!profile || (profile.ownerId==='alex' && profile.stacks.includes('TypeScript') && profile.stacks.includes('React'))) && <>
          <section className="mentor-profile-section" aria-labelledby="mentor-specialties-title">
            <h2 id="mentor-specialties-title">What I can help with</h2>
            <ul className="mentor-profile-specialties">
              <li><Check aria-hidden="true" /><div><h3>TypeScript types and narrowing</h3><p>Use union types and API result types to express constraints the compiler can check.</p></div></li>
              <li><Check aria-hidden="true" /><div><h3>React state and effects</h3><p>Decide what belongs in a component, how to organise its state and effects, and when to split it up.</p></div></li>
              <li><Check aria-hidden="true" /><div><h3>API response design</h3><p>Compare response shapes and error contracts before other parts of the application depend on them.</p></div></li>
            </ul>
          </section>

          <section className="mentor-profile-section" aria-labelledby="mentor-work-title">
            <div className="mentor-profile-section-heading"><h2 id="mentor-work-title">Sample answer</h2><p>See how I explain an API design choice.</p></div>
            <Card className="mentor-profile-work">
              <div className="mentor-profile-work-label"><FileCode2 aria-hidden="true" /><span>Example walkthrough</span><Badge variant="outline">TypeScript</Badge></div>
              <h3>Separate success and failure in an API result</h3>
              <p>Use one field to distinguish data from an error. The example explains the type, shows how the caller uses it and why the check works.</p>
              <div className="mentor-profile-code"><span className="mentor-profile-code-label">The starting point</span><code>Result&lt;T&gt; = Success&lt;T&gt; | Failure</code></div>
              <details className="mentor-profile-sample"><summary className="proto-inline-link">Read the sample answer</summary><p>Use an explicit ok discriminator. Keep successful data and error details in separate branches so callers can narrow the result before reading it. During migration, keep an adapter for consumers that still expect the old response shape.</p></details>
            </Card>
          </section>

          <section className="mentor-profile-section" aria-labelledby="mentor-approach-title">
            <h2 id="mentor-approach-title">How I run a session</h2>
            <ol className="mentor-profile-approach">
              <li><span aria-hidden="true">01</span><div><h3>Explain the problem</h3><p>Bring a question and a small code example. Tell me what you want the code to do.</p></div></li>
              <li><span aria-hidden="true">02</span><div><h3>Discuss the options</h3><p>We will look at the problem together in text. You can return to the conversation afterward.</p></div></li>
              <li><span aria-hidden="true">03</span><div><h3>Read the written answer</h3><p>I will write up the answer and what to try next. You review the private session note before approving it.</p></div></li>
            </ol>
          </section>

          </>}
          <div className="mentor-profile-feedback">
            <MentorReviews reviews={reviews} title="What mentees say" />
            <p className="mentor-profile-demo-label">Example feedback for this local prototype.</p>
          </div>
        </div>
      </div>
    </PublicPage>
  </Screen>;
}
