import React, { type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, FileText, UserRound, SlidersHorizontal } from 'lucide-react';
import { Button } from '@devmentor/ui';
import { AppShell } from '@devmentor/ui/backend';
import { navigate } from './navigation';

export function Screen({ id, title, description, refs, children, note }: { id:string; title:string; description:string; refs:string[]; children:ReactNode; note?:ReactNode }) {
  return <section className="screen" id={id} aria-label={title}>
    <div className="screen-meta"><h2>{title}</h2><p>{description}</p><div className="screen-refs">{refs.map(ref=><span className="ref" key={ref}>{ref}</span>)}</div></div>
    <div className="frame">{children}</div>
    {note && <div className="notes"><div className="note">{note}</div></div>}
  </section>;
}

export function PublicPage({ children, back, className, navigation, footer }: { children:ReactNode; back?:string; className?:string; navigation?:ReactNode; footer?:ReactNode }) {
  return <div className={['proto-public',className].filter(Boolean).join(' ')}><header className="proto-public-header"><button className="proto-wordmark" onClick={()=>navigate('s17')}>DevMentor<span aria-hidden="true">✦</span></button><nav aria-label="Main navigation">{navigation??<><Button intent="neutral" appearance="ghost" onClick={()=>navigate('s6')}>My sessions</Button><Button intent="neutral" appearance="stroke" onClick={()=>navigate('s12')}>Sign in</Button></>}</nav></header>
    <main className="proto-public-main">{back && <Button size="sm" intent="neutral" appearance="ghost" onClick={()=>navigate(back)}><ArrowLeft aria-hidden="true" />Back</Button>}{children}</main>
    <footer className="proto-public-footer">{footer??<><span>Get coding help from a mentor.</span><span className="dm-meta-group"><span>Text sessions</span><span>Written answers</span><span>Private notes</span></span></>}</footer></div>;
}

export function Workspace({ children, mentor = false }: { children:ReactNode; mentor?:boolean }) {
  return <AppShell user={{displayName:mentor?'Alex Laurent':'Jordan Lee'}}
    nav={<><button onClick={()=>navigate('s6')}><CalendarDays aria-hidden="true" />My sessions</button><button onClick={()=>navigate('s9')}><FileText aria-hidden="true" />Private notes</button>{mentor && <button onClick={()=>navigate('s11')}><SlidersHorizontal aria-hidden="true" />Availability & prices</button>}<button onClick={()=>navigate('s1')}><UserRound aria-hidden="true" />Mentor profile</button></>}
    actions={<Button size="sm" intent="neutral" appearance="stroke" onClick={()=>navigate(mentor?'s6':'s11')}>{mentor?'Mentee view':'Mentor view'}</Button>}>
    {children}
  </AppShell>;
}
