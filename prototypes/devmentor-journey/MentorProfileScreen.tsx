import { ArrowRight, CalendarDays, Check, Clock3, FileCode2, FileText, Globe2, LockKeyhole, MessageSquare } from 'lucide-react';
import { Badge, Button, Card, MentorRatingSummary, MentorReviews, TechnologyChips, type MentorReview } from '@devmentor/ui';
import { PublicPage, Screen } from './Frame';
import { money } from './flow';
import { navigate } from './navigation';
import './mentor-profile.css';

export interface MentorProfileScreenProps {
  prices: { 25: number; 50: number };
  reviews: MentorReview[];
}

export function MentorProfileScreen({ prices, reviews }: MentorProfileScreenProps) {
  const average = reviews.length === 0 ? 0 : reviews.reduce((total, review) => total + review.rating, 0) / reviews.length;

  return <Screen id="s1" title="Mentor profile" description="Read about the mentor and their work, check reviews and choose a session." refs={['#16', '#18']} note="Local profile example. Alex Laurent, the biography, language and timezone details, work sample and initial reviews are fictional. Submitted reviews stay in this prototype. Availability uses the fixed demo clock. The work sample opens the written-answer screen.">
    <PublicPage className="mentor-profile-page">
      <div className="mentor-profile-layout">
        <header className="mentor-profile-header">
          <div className="mentor-profile-identity">
            <span className="mentor-profile-avatar" aria-hidden="true">AL</span>
            <div><p className="mentor-profile-eyebrow">Developer mentor</p><h1>Alex Laurent</h1><p className="mentor-profile-role">Staff engineer specialising in TypeScript & React</p></div>
          </div>
          <p className="mentor-profile-intro">I help you understand what is going wrong in your code and choose a change you can explain.</p>
          <TechnologyChips stacks={['TypeScript', 'React', 'API design']} />
          <MentorRatingSummary average={average} reviewCount={reviews.length} />
          <dl className="mentor-profile-context">
            <div><dt><Globe2 aria-hidden="true" />Session language</dt><dd>English</dd></div>
            <div><dt><Clock3 aria-hidden="true" />Mentor timezone</dt><dd>Europe/Warsaw</dd></div>
          </dl>
        </header>

        <aside className="mentor-profile-booking" aria-labelledby="mentor-booking-title">
          <Card className="mentor-booking-card">
            <div className="mentor-booking-intro"><p className="mentor-profile-eyebrow">Book with Alex</p><h2 id="mentor-booking-title">Choose your session.</h2><p>Pick a session length based on how much you want to discuss.</p></div>
            <dl className="mentor-profile-prices">
              <div><dt><strong>25 minutes</strong><span>A focused question</span></dt><dd>{money(prices[25])}</dd></div>
              <div><dt><strong>50 minutes</strong><span>More time for detail</span></dt><dd>{money(prices[50])}</dd></div>
            </dl>
            <div className="mentor-profile-availability"><p><CalendarDays aria-hidden="true" />Published availability</p><div className="dm-fact-chips" role="group" aria-label="Days with published sessions"><Badge variant="outline">Thursday</Badge><Badge variant="outline">Friday</Badge></div></div>
            <Button className="mentor-profile-book-button" onClick={() => navigate('s3')}>Choose a session<ArrowRight aria-hidden="true" /></Button>
            <p className="mentor-booking-hint">See the available times in your timezone. Book at least 2 hours ahead.</p>
            <ul className="mentor-profile-included" aria-label="Included with your session">
              <li><MessageSquare aria-hidden="true" /><span>A conversation in text</span></li>
              <li><FileText aria-hidden="true" /><span>A written answer to keep</span></li>
              <li><LockKeyhole aria-hidden="true" /><span>A private session note</span></li>
            </ul>
          </Card>
        </aside>

        <div className="mentor-profile-content">
          <section className="mentor-profile-section" aria-labelledby="mentor-about-title">
            <h2 id="mentor-about-title">About me</h2>
            <div className="mentor-profile-prose"><p>I work on API types and how callers use them, the responsibilities of React components, and architecture choices that make a codebase easier to change.</p><p>I like to start a session with a small example and hear how you understand the problem. We can work out what is confusing, compare options and choose a change that fits your code. Ask me to slow down or explain something differently whenever you need to.</p></div>
          </section>

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
              <Button intent="neutral" appearance="stroke" onClick={() => navigate('s8')}>Read the sample answer<ArrowRight aria-hidden="true" /></Button>
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

          <div className="mentor-profile-feedback">
            <MentorReviews reviews={reviews} title="What mentees say" />
            <p className="mentor-profile-demo-label">Example feedback for this local prototype.</p>
          </div>
        </div>
      </div>
    </PublicPage>
  </Screen>;
}
