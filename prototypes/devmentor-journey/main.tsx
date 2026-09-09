import React, { useEffect, useReducer, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { setupWorker } from 'msw/browser';
import { delay, http, HttpResponse } from 'msw';
import { Moon, Sun, SlidersHorizontal } from 'lucide-react';
import { Button, type MentorReview, type MentorReviewValues } from '@devmentor/ui';
import { apiCallOrThrow } from '@devmentor/ui/backend';
import { BookingScreens } from './BookingScreens';
import { SessionScreens } from './SessionScreens';
import { LandingScreen } from './LandingScreen';
import { MentorProfileScreen } from './MentorProfileScreen';
import { MentorCatalogueScreen } from './MentorCatalogueScreen';
import { getPrototypeMentors } from './mentors';
import { INITIAL_REVIEWS } from './reviews';
import { dateLabel, DEMO_NOW, timeLabel } from './flow';
import { navigate } from './navigation';
import { AuthScreens, AuthDemoControls } from './AuthScreens';
import { AuthContext, useAuthController } from './auth-context';
import { authDemo, authHandlers } from './auth-runtime';
import { mentorDemo, mentorHandlers } from './mentor-runtime';
import { MentorDemoControls, MentorScreens } from './MentorScreens';
import type { InvitationMode } from './mentor-model';
import { createSessionReview, INITIAL_SESSION, sessionForUser, sessionKey, upsertMentorReview, type ConfirmedSession, type ReviewsByMentor } from './session-view-model';
import './styles.css';
import './comments.js';
import './prototype.js';

declare global { interface Window { __DEVMENTOR_PROTOTYPE_START__:()=>boolean } }
const screens = [
 ['s17','Home'],['s20','Create an account'],['s21','Check your inbox'],['s22','Email verification'],['s23','GitHub response preview'],['s24','Operator home'],['s25','Operator users'],
 ['s26','Mentor invitation'],['s27','Edit mentor profile'],['s28','Payout settings'],['s29','Stripe response preview'],
 ['s19','Mentor catalogue'],
 ['s1','Mentor profile'],['s3','Choose a session'],['s12','Sign in'],['s4','Booking summary'],
 ['s14','Demo checkout'],['s5','Payment recovery'],['s13','Slot conflict / expiry'],['s6','My sessions'],
 ['s7','Text session'],['s8','Written answer'],['s9','Review private note'],['s10','Request changes'],
 ['s15','Approved note'],['s18','Review your mentor'],['s11','Mentor workspace'],['s2','No available times'],['s16','No access'],
];
function Prototype() {
 const [,refreshMentors]=useReducer((value:number)=>value+1,0);
 const [viewedMentorId,setViewedMentorId]=useState(new URL(location.href).searchParams.get('mentor') ?? 'alex');
 const publicProfile=mentorDemo.getPublic(viewedMentorId);
 const bookable=!!publicProfile && publicProfile.prices[25]!==null && publicProfile.prices[50]!==null;
 const prices={25:publicProfile?.prices[25]??0,50:publicProfile?.prices[50]??0};
 const slots=bookable?publicProfile.slots:[];
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [duration,setDuration]=useState<25|50>(25);
 const [timeZone,setTimeZone]=useState('Europe/Warsaw');
 const [confirmed,setConfirmed]=useState<ConfirmedSession|null>(null);
 const [conflict,setConflict]=useState<'slot-taken'|'expired'>('slot-taken');
 const [showAuthControls,setShowAuthControls]=useState(false);
 const [showMentorControls,setShowMentorControls]=useState(false);
 const [invitationMode,setInvitationMode]=useState<InvitationMode>('valid');
 const [failMentor,setFailMentor]=useState(false);
 const [dark,setDark]=useState(false);
 const [review,setReview]=useState(false);
 const [reviewsByMentor,setReviewsByMentor]=useState<ReviewsByMentor>({alex:INITIAL_REVIEWS});
 const [submittedReviews,setSubmittedReviews]=useState<Record<string,MentorReview>>({});
 const selected=slots.find(slot=>slot.id===selectedId&&!slot.blockedReason)??null;
 const visibleConfirmed=sessionForUser(confirmed,authDemo.getSession());
 const sessionData=visibleConfirmed??INITIAL_SESSION;
 const session=sessionData.slot;
 const auth=useAuthController(selected!==null,visibleConfirmed!==null);
 const screen=auth.screen;
 const catalogueProfile=mentorDemo.getPublic('alex')!;
 const profile=auth.user?.roles.includes('mentor')?mentorDemo.getProfile(auth.user):null;
 useEffect(()=>{const changed=()=>{refreshMentors();setFailMentor(false);};document.addEventListener('devmentor:mentor-result',changed);return()=>document.removeEventListener('devmentor:mentor-result',changed);},[]);
 function previewMentor(id:string) {setViewedMentorId(id);setSelectedId(null);navigate('s1');}
 async function submitMentorReview(values:MentorReviewValues) {
   const reviewer=authDemo.getSession();
   if(!reviewer || reviewer.id!==sessionData.buyerId) throw new Error('Only the mentee who booked this session can review it.');
   await apiCallOrThrow('/prototype-api/devmentor-journey/save',{body:values});
   if(authDemo.getSession()?.id!==reviewer.id) throw new Error('Sign in again before submitting your review.');
   const nextReview=createSessionReview(sessionData,values);
   setReviewsByMentor(current=>upsertMentorReview(current,sessionData.mentorId,nextReview));
   setSubmittedReviews(current=>({...current,[sessionKey(sessionData)]:nextReview}));
 }
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';},[dark]);
 useEffect(()=>{document.body.classList.toggle('proto-review-tools',review);},[review]);
 function outcome(value:'confirmed'|'failed'|'slot-taken'|'expired') {
   if(value==='confirmed') {
     if(selected && auth.user && publicProfile) { const result=mentorDemo.bookSlot(viewedMentorId,selected.id); if(!result.ok){setConflict('slot-taken');setSelectedId(null);navigate('s13');return;} setConfirmed({slot:{...selected},duration,price:prices[duration],buyerId:auth.user.id,buyerName:auth.user.displayName,mentorId:publicProfile.ownerId,mentorName:publicProfile.displayName});refreshMentors(); }
     navigate('s6');return;
   }
   if(value==='failed') {navigate('s5');return;}
   setConflict(value);
   if(value==='slot-taken' && selectedId) {mentorDemo.bookSlot(viewedMentorId,selectedId);refreshMentors();}
   setSelectedId(null);navigate('s13');
 }
 return <AuthContext.Provider value={auth}>
  <header className="doc-toolbar"><div className="proto-review-brand"><strong>DevMentor</strong><span>Prototype</span></div><label className="proto-screen-select"><span className="sr-only">Preview screen</span><select value={screen} onChange={event=>navigate(event.target.value)}>{screens.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label><span className="proto-local-badge">Local demo</span><Button className="proto-scenario-toggle" size="xs" intent="neutral" appearance="ghost" aria-expanded={showAuthControls} onClick={()=>setShowAuthControls(!showAuthControls)}>Auth scenarios</Button><Button className="proto-scenario-toggle" size="xs" intent="neutral" appearance="ghost" aria-expanded={showMentorControls} onClick={()=>setShowMentorControls(!showMentorControls)}>Mentor scenarios</Button><a className="btn btn-ghost proto-guide-link" href="../../?path=/docs/design-system-implementation-handoff--docs">Implementation guide</a><Button size="xs" intent="neutral" appearance="ghost" aria-expanded={review} onClick={()=>setReview(!review)}><SlidersHorizontal aria-hidden="true" />Review tools</Button><button id="theme-toggle" type="button" className="btn btn-outline btn-sm" aria-label={dark?'Use light theme':'Use dark theme'} onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>}</button><nav className="screen-nav" aria-label="Review screen map">{screens.map(([id,title])=><a href={`#${id}`} key={id} aria-current={id===screen?'page':undefined}>{title}</a>)}</nav></header>
  {showAuthControls && <AuthDemoControls/>}
  {showMentorControls && <MentorDemoControls mode={invitationMode} onModeChange={setInvitationMode} failNext={failMentor} onFailChange={value=>{setFailMentor(value);mentorDemo.setFailure(value);}}/>}
  <div className="doc"><header className="doc-head"><p className="proto-eyebrow">DevMentor Design System: clickable flow</p><h1>Accounts, booking and mentor sessions</h1><p>This demo uses fictional data and simulates sign-in and payments locally. Demo clock: 10 September 2026, 08:00 UTC. Review comments stay in this browser until exported.</p></header>
   <AuthScreens/>
   <MentorScreens profile={profile} invitationMode={invitationMode} onPreview={previewMentor}/>
   <LandingScreen reviews={reviewsByMentor.alex} onMeetMentor={()=>previewMentor('alex')}/>
   <MentorCatalogueScreen mentors={getPrototypeMentors({25:catalogueProfile.prices[25]??180,50:catalogueProfile.prices[50]??320},reviewsByMentor.alex,catalogueProfile.slots,catalogueProfile)} now={new Date(DEMO_NOW).toISOString()} onFullProfile={()=>previewMentor('alex')}/>
   <MentorProfileScreen prices={prices} reviews={reviewsByMentor[viewedMentorId]??[]} profile={publicProfile} bookable={bookable}/>
   <BookingScreens mentorName={publicProfile?.displayName} slots={slots} selected={selected} duration={duration} prices={prices} timeZone={timeZone} signedIn={auth.user!==null} onSelect={setSelectedId} onDuration={setDuration} onTimeZone={setTimeZone} onOutcome={outcome} conflict={conflict}/>
   <SessionScreens key={sessionKey(sessionData)} hasBooking={auth.hasSession} mentorName={sessionData.mentorName} menteeName={sessionData.buyerName} isMentor={auth.user?.id===sessionData.mentorId} onViewMentor={()=>previewMentor(sessionData.mentorId)} duration={sessionData.duration} sessionPrice={sessionData.price} slots={slots} startsAt={session.start} dateLabel={dateLabel(session.start,timeZone)} timeLabel={timeLabel(session.start,timeZone)} timeZone={timeZone} prices={prices} submittedReview={submittedReviews[sessionKey(sessionData)]??null} onReviewSubmit={submitMentorReview} onPricesChange={()=>{}} onSlotAdded={()=>{}}/>
  </div>
 </AuthContext.Provider>;
}

const worker=setupWorker(...authHandlers,...mentorHandlers,http.post('/prototype-api/devmentor-journey/save',async({request})=>{
 const data=await request.json();await delay(300);return HttpResponse.json({ok:true,data});
}));
async function start() {
 await worker.start({quiet:true,serviceWorker:{url:'/mockServiceWorker.js'},onUnhandledRequest:'bypass'});
 flushSync(()=>createRoot(document.getElementById('root')!).render(<Prototype/>));
 window.__DEVMENTOR_PROTOTYPE_START__();
}
start().catch(()=>{
 const root=document.getElementById('root')!;
 root.setAttribute('role','alert');root.textContent='The local prototype could not start. Reload this page from the Storybook localhost server.';
});
