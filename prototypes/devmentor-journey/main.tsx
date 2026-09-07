import React, { useEffect, useState } from 'react';
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
import { dateLabel, DEMO_NOW, INITIAL_SLOTS, timeLabel, type Slot } from './flow';
import { getSignInDestination, navigate } from './navigation';
import './styles.css';
import './comments.js';
import './prototype.js';

declare global { interface Window { __DEVMENTOR_PROTOTYPE_START__:()=>boolean } }
const screens = [
 ['s17','Home'],
 ['s19','Mentor catalogue'],
 ['s1','Mentor profile'],['s3','Choose a session'],['s12','Sign in'],['s4','Booking summary'],
 ['s14','Demo checkout'],['s5','Payment recovery'],['s13','Slot conflict / expiry'],['s6','My sessions'],
 ['s7','Text session'],['s8','Written answer'],['s9','Review private note'],['s10','Request changes'],
 ['s15','Approved note'],['s18','Review your mentor'],['s11','Mentor workspace'],['s2','No available times'],['s16','No access'],
];
function Prototype() {
 const [slots,setSlots]=useState<Slot[]>(INITIAL_SLOTS);
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [duration,setDuration]=useState<25|50>(25);
 const [prices,setPrices]=useState<{25:number;50:number}>({25:180,50:320});
 const [timeZone,setTimeZone]=useState('Europe/Warsaw');
 const [signedIn,setSignedIn]=useState(false);
 const [signInDestination,setSignInDestination]=useState<'s4'|'s6'>('s6');
 const [confirmed,setConfirmed]=useState<{slot:Slot;duration:25|50;price:number}|null>(null);
 const [conflict,setConflict]=useState<'slot-taken'|'expired'>('slot-taken');
 const [screen,setScreen]=useState(location.hash.slice(1)||'s17');
 const [dark,setDark]=useState(false);
 const [review,setReview]=useState(false);
 const [mentorReviews,setMentorReviews]=useState<MentorReview[]>(INITIAL_REVIEWS);
 const [submittedReview,setSubmittedReview]=useState<MentorReview|null>(null);
 const selected=slots.find(slot=>slot.id===selectedId&&!slot.blockedReason)??null;
 const session=confirmed?.slot??INITIAL_SLOTS[1];
 async function submitMentorReview(values:MentorReviewValues) {
   await apiCallOrThrow('/prototype-api/devmentor-journey/save',{body:values});
   const nextReview:MentorReview={...values,id:'jordan-session-review',reviewerName:'Jordan Lee',createdAt:new Date(Date.parse(session.start)+((confirmed?.duration??25)+5)*60_000).toISOString(),dateLabel:'After your session'};
   setMentorReviews(current=>[nextReview,...current.filter(item=>item.id!==nextReview.id)]);
   setSubmittedReview(nextReview);
 }
 useEffect(()=>{
   const update=(event:Event)=>{
     const nextScreen=(event as CustomEvent<string>).detail;
     if(nextScreen==='s12') setSignInDestination(getSignInDestination(screen,selected!==null));
     setScreen(nextScreen);
   };
   document.addEventListener('devmentor:screen-change',update);
   return ()=>document.removeEventListener('devmentor:screen-change',update);
 },[screen,selected]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';},[dark]);
 useEffect(()=>{document.body.classList.toggle('proto-review-tools',review);},[review]);
 function outcome(value:'confirmed'|'failed'|'slot-taken'|'expired') {
   if(value==='confirmed') {
     if(selected) setConfirmed({slot:selected,duration,price:prices[duration]});
     navigate('s6');return;
   }
   if(value==='failed') {navigate('s5');return;}
   setConflict(value);
   if(value==='slot-taken') setSlots(current=>current.map(slot=>slot.id===selectedId?{...slot,blockedReason:'Already booked'}:slot));
   setSelectedId(null);navigate('s13');
 }
 return <>
  <header className="doc-toolbar"><div className="proto-review-brand"><strong>DevMentor</strong><span>Prototype</span></div><label className="proto-screen-select"><span className="sr-only">Preview screen</span><select value={screen} onChange={event=>navigate(event.target.value)}>{screens.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label><span className="proto-local-badge">Local demo</span><Button size="xs" intent="neutral" appearance="ghost" aria-expanded={review} onClick={()=>setReview(!review)}><SlidersHorizontal aria-hidden="true" />Review tools</Button><button id="theme-toggle" type="button" className="btn btn-outline btn-sm" aria-label={dark?'Use light theme':'Use dark theme'} onClick={()=>setDark(!dark)}>{dark?<Sun size={16}/>:<Moon size={16}/>}</button><nav className="screen-nav" aria-label="Review screen map">{screens.map(([id,title])=><a href={`#${id}`} key={id} aria-current={id===screen?'page':undefined}>{title}</a>)}</nav></header>
  <div className="doc"><header className="doc-head"><p className="proto-eyebrow">DevMentor Design System: clickable flow</p><h1>Booking, sessions and mentor feedback</h1><p>This demo uses fictional data and simulates sign-in and payments locally. Demo clock: 10 September 2026, 08:00 UTC. Review comments stay in this browser until exported.</p></header>
   <LandingScreen reviews={mentorReviews}/>
   <MentorCatalogueScreen mentors={getPrototypeMentors(prices,mentorReviews,slots)} now={new Date(DEMO_NOW).toISOString()}/>
   <MentorProfileScreen prices={prices} reviews={mentorReviews}/>
   <BookingScreens slots={slots} selected={selected} duration={duration} prices={prices} timeZone={timeZone} signedIn={signedIn} continuingBooking={signInDestination==='s4'} onSelect={setSelectedId} onDuration={setDuration} onTimeZone={setTimeZone} onSignIn={()=>{setSignedIn(true);navigate(signInDestination);}} onOutcome={outcome} conflict={conflict}/>
   <SessionScreens duration={confirmed?.duration??25} sessionPrice={confirmed?.price??180} slots={slots} startsAt={session.start} dateLabel={dateLabel(session.start,timeZone)} timeLabel={timeLabel(session.start,timeZone)} timeZone={timeZone} prices={prices} submittedReview={submittedReview} onReviewSubmit={submitMentorReview} onPricesChange={setPrices} onSlotAdded={startsAt=>setSlots(current=>current.some(s=>s.start===startsAt)?current:[...current,{id:`added-${startsAt}`,start:startsAt}])}/>
  </div>
 </>;
}

const worker=setupWorker(http.post('/prototype-api/devmentor-journey/save',async({request})=>{
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
