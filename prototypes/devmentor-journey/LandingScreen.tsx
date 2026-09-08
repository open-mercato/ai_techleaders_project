import { ArrowRight, Check, Clock3, CodeXml, FileText, LockKeyhole, MessageSquare } from 'lucide-react';
import { Badge, Button, Card, MentorRatingSummary, TechnologyChips, type MentorReview } from '@devmentor/ui';
import { PublicPage, Screen } from './Frame';
import { useAuth } from './auth-context';
import { homeFor } from './auth-model';
import { navigate, scrollToSection } from './navigation';
import developerIllustration from './assets/developer-mentoring.png';
import './landing.css';

export function LandingScreen({ reviews }: { reviews: MentorReview[] }) {
  const auth = useAuth();
  const accountScreen = auth?.user ? homeFor(auth.user.roles) : 's12';
  const accountLabel = auth?.user ? 'My workspace' : 'Sign in';
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  return <Screen id="s17" title="Home" description="See how text mentoring works, find a mentor and choose a session." refs={['#16', '#18', '#27', 'M01', 'M04']}
    note="Local homepage with an original generated illustration. All mentors and reviews are fictional. The catalogue supports local search and profile previews; Alex Laurent has the complete booking flow. Freelance hiring and public mentor registration are outside this prototype.">
    <PublicPage className="proto-landing-page" navigation={<>
      <Button className="home-section-nav" intent="neutral" appearance="ghost" onClick={() => scrollToSection('landing-how-title')}>How it works</Button>
      <Button className="home-section-nav" intent="neutral" appearance="ghost" onClick={() => scrollToSection('home-mentor-title')}>Meet a mentor</Button>
      <Button intent="neutral" appearance="ghost" onClick={() => navigate(accountScreen)}>{accountLabel}</Button>
      <Button onClick={() => navigate('s19')}>Find your mentor<ArrowRight aria-hidden="true" /></Button>
    </>} footer={<div className="home-footer-inner">
      <div><span className="home-footer-wordmark">DevMentor<span aria-hidden="true">✦</span></span><p>Discuss your code with a mentor.<br />Keep the explanation for later.</p></div>
      <nav aria-label="Footer navigation"><button onClick={() => navigate('s19')}>Find a mentor</button><button onClick={() => scrollToSection('landing-how-title')}>How it works</button><button onClick={() => navigate(accountScreen)}>{accountLabel}</button></nav>
      <div className="home-footer-detail"><span>1:1 text mentoring</span><span>Written answers and private session notes</span></div>
    </div>}>
      <div className="proto-landing">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="home-container">
            <p className="home-eyebrow">Developer mentoring</p>
            <h1 id="landing-title">Work through your code<br /><span>with a mentor.</span></h1>
            <p className="landing-lead">Discuss a problem in your code with another developer.<br className="home-wide-break" /> Your mentor writes up the answer so you can use it later.</p>
            <div className="home-hero-actions"><Button onClick={() => navigate('s19')}>Find your mentor<ArrowRight aria-hidden="true" /></Button></div>
            <div className="dm-fact-chips home-hero-facts" role="group" aria-label="Session format"><Badge variant="outline"><MessageSquare aria-hidden="true" />1:1 text sessions</Badge><Badge variant="outline"><Clock3 aria-hidden="true" />25 or 50 minutes</Badge><Badge variant="outline"><FileText aria-hidden="true" />Written answer included</Badge></div>
            <img className="home-hero-art" src={developerIllustration} width={1536} height={1024} alt="" fetchPriority="high" />
          </div>
        </section>
        <section className="home-help home-container" aria-labelledby="home-help-title">
          <div className="home-section-heading"><p className="home-eyebrow">During your session</p><h2 id="home-help-title">Talk through the part<br />you are stuck on.</h2></div>
          <div className="home-feature-row">
            <div className="home-feature-copy"><p className="home-eyebrow">Bring your code</p><h3>Understand what is happening<br />and what to change.</h3><p>You might have a type error you cannot explain, an API that feels too complicated or a React component that keeps growing. Share the example with your mentor.</p>
              <ul className="home-check-list"><li><Check aria-hidden="true" />Work on your own code example</li><li><Check aria-hidden="true" />Ask why a change works and what to try next</li><li><Check aria-hidden="true" />Choose the session length and ask for the pace you need</li></ul>
              <Button onClick={() => navigate('s1')}>View mentor profile<ArrowRight aria-hidden="true" /></Button>
            </div>
            <div className="home-chat-scene">
              <span className="home-scene-caption"><MessageSquare aria-hidden="true" />An example text session</span>
              <Card className="home-conversation" role="region" aria-label="Example mentoring conversation">
                <header><span className="home-avatar" aria-hidden="true">AL</span><div><strong>Alex Laurent</strong><span>TypeScript mentor</span></div><Badge variant="outline">Text session</Badge></header>
                <div className="home-message"><span>Jordan</span><p>My API returns data or an error. Why do callers keep checking both?</p></div>
                <div className="home-message home-message-answer"><span>Alex</span><p>Add an <code>ok</code> field to distinguish success from failure. TypeScript can then narrow the result when you check that field.</p><pre role="region" tabIndex={0} aria-label="Example TypeScript result"><code>{'type Result<T> =\n  | { ok: true; data: T }\n  | { ok: false; error: string };'}</code></pre></div>
              </Card>
              <span className="home-scene-note">Start with your own example.<ArrowRight aria-hidden="true" /></span>
            </div>
          </div>
          <div className="home-feature-row home-feature-reverse">
            <div className="home-answer-scene" aria-label="Example written answer" role="region">
              <div className="home-answer-sheet"><div className="home-answer-label"><FileText aria-hidden="true" /><span>Your written answer</span></div><h3>A clearer result type<br />at the API boundary</h3><p>One signal tells the caller what happened. Keep the success data and the error in separate branches.</p><div className="home-code-line"><CodeXml aria-hidden="true" /><code>{'if (result.ok) { ... }'}</code></div><div className="home-answer-next"><span>YOUR NEXT STEP</span><p>Try it in one endpoint.<br />Test the success and error paths.</p></div></div>
              <div className="home-private-stamp"><LockKeyhole aria-hidden="true" /><div><strong>Your note stays private</strong><span>Read it, request any changes and approve it.</span></div></div>
            </div>
            <div className="home-feature-copy"><p className="home-eyebrow">After your session</p><h3 id="landing-takeaway-title">Return to the explanation<br />when you need it.</h3><p>Your mentor writes up the answer, including the reasoning and code you discussed. You can refer to it while making the change.</p><ul className="home-check-list"><li><Check aria-hidden="true" />A written explanation with code examples</li><li><Check aria-hidden="true" />A private note of the decisions you reached</li><li><Check aria-hidden="true" />A chance to request changes before approving the note</li></ul><p className="home-quiet-note">Approving your note keeps it private.</p></div>
          </div>
        </section>
        <section className="home-mentor-band" aria-labelledby="home-mentor-title"><div className="home-container">
          <div className="home-section-heading"><p className="home-eyebrow">Your mentor</p><h2 id="home-mentor-title" tabIndex={-1}>See who you will work with.</h2><p>Read about their experience and the problems they help with,<br className="home-wide-break" /> then check reviews from other developers.</p></div>
          <Card className="home-mentor-card"><div className="home-mentor-identity"><span className="home-mentor-avatar" aria-hidden="true">AL</span><div><p className="home-eyebrow">Example mentor profile</p><h3>Alex Laurent</h3><p>Staff engineer</p><TechnologyChips stacks={['TypeScript', 'React', 'API design']} /></div></div><div className="home-mentor-details"><p>I help developers simplify complex types, decide where code belongs and work through architecture choices.</p>{reviews.length > 0 && <MentorRatingSummary average={average} reviewCount={reviews.length} />}<Button onClick={() => navigate('s1')}>Meet Alex<ArrowRight aria-hidden="true" /></Button><span className="home-demo-caption">Fictional mentor and reviews for this prototype.</span></div></Card>
        </div></section>
        <section className="home-how home-container" aria-labelledby="landing-how-title"><div className="home-section-heading"><p className="home-eyebrow">How it works</p><h2 id="landing-how-title" tabIndex={-1}>Book a session for your question.</h2></div><ol className="home-steps">
          <li><span className="home-step-number" aria-hidden="true">01</span><h3>Choose a mentor</h3><p>Read their profile and work examples to see if they can help with your problem.</p></li>
          <li><span className="home-step-number" aria-hidden="true">02</span><h3>Choose a time</h3><p>Pick 25 or 50 minutes, check the price and reserve your session.</p></li>
          <li><span className="home-step-number" aria-hidden="true">03</span><h3>Discuss your code</h3><p>Explain the problem in text. Your mentor writes up the answer and what to try next.</p></li>
        </ol></section>
        <section className="home-closing" aria-labelledby="home-closing-title"><div className="home-container"><p className="home-eyebrow">Get help with your code</p><h2 id="home-closing-title">Find a mentor for the problem<br />you are working on.</h2><div><Button onClick={() => navigate('s19')}>Find your mentor<ArrowRight aria-hidden="true" /></Button><Button intent="neutral" appearance="stroke" onClick={() => navigate(accountScreen)}>{auth?.user ? 'Open my workspace' : 'Already have an account? Sign in'}</Button></div></div></section>
      </div>
    </PublicPage>
  </Screen>;
}
