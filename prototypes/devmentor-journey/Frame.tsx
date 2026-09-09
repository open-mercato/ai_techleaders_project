import React, { useEffect, useId, useState, type ReactNode } from 'react';
import { ArrowLeft, CalendarDays, FileText, UserRound, SlidersHorizontal, ShieldCheck, Users, Menu } from 'lucide-react';
import { AuthFeedback, Button } from '@devmentor/ui';
import { AppShell } from '@devmentor/ui/backend';
import { navigate } from './navigation';
import { sessionDetailScreens, useAuth } from './auth-context';
import { allowedScreen, homeFor } from './auth-model';

export function Screen({ id, title, description, refs, children, note }: { id:string; title:string; description:string; refs:string[]; children:ReactNode; note?:ReactNode }) {
  const auth = useAuth();
  const lacksSession = !!auth?.user && sessionDetailScreens.has(id) && !auth.hasSession;
  const allowed = !auth || (allowedScreen(auth.user, id) && !lacksSession);
  return <section className="screen" id={id} aria-label={title}>
    <div className="screen-meta"><h2>{title}</h2><p>{description}</p><div className="screen-refs">{refs.map(ref=><span className="ref" key={ref}>{ref}</span>)}</div></div>
    <div className="frame">{allowed ? children : <div className="proto-access-gate"><h1>{!auth.user ? 'Sign in to continue' : lacksSession ? 'Choose a session first' : 'This page needs another role'}</h1><Button onClick={() => navigate(!auth.user ? 's12' : lacksSession ? 's6' : homeFor(auth.user.roles))}>{!auth.user ? 'Sign in' : lacksSession ? 'Open my sessions' : 'Open my workspace'}</Button></div>}</div>
    {note && <div className="notes"><div className="note">{note}</div></div>}
  </section>;
}

export function PublicPage({ children, back, className, navigation, footer }: { children:ReactNode; back?:string; className?:string; navigation?:ReactNode; footer?:ReactNode }) {
  const auth = useAuth();
  return <div className={['proto-public',className].filter(Boolean).join(' ')}><header className="proto-public-header"><button className="proto-wordmark" onClick={()=>navigate('s17')}>DevMentor<span aria-hidden="true">✦</span></button><nav aria-label="Main navigation">{navigation??<><Button intent="neutral" appearance="ghost" onClick={()=>navigate('s19')}>Mentors</Button><Button intent="neutral" appearance="ghost" onClick={()=>navigate(auth?.user ? homeFor(auth.user.roles) : 's6')}>{auth?.user ? 'My workspace' : 'My sessions'}</Button>{auth?.user ? <Button intent="neutral" appearance="stroke" disabled={auth.busy} onClick={() => void auth.logout()}>Sign out</Button> : <Button intent="neutral" appearance="stroke" onClick={()=>navigate('s12')}>Sign in</Button>}</>}</nav></header>
    <main className="proto-public-main">{back && <Button size="sm" intent="neutral" appearance="ghost" onClick={()=>navigate(back)}><ArrowLeft aria-hidden="true" />Back</Button>}{(auth?.notice === 'signed-out' || auth?.notice === 'service-unavailable') && <div className="proto-workspace-notice"><AuthFeedback state={auth.notice}/></div>}{children}</main>
    <footer className="proto-public-footer">{footer??<><span>Get coding help from a mentor.</span><span className="dm-meta-group"><span>Text sessions</span><span>Written answers</span><span>Private notes</span></span></>}</footer></div>;
}

export function Workspace({ children, mentor = false }: { children:ReactNode; mentor?:boolean }) {
  const auth = useAuth();
  const [menuOpen,setMenuOpen]=useState(false);
  const menuId=useId();
  useEffect(()=>{
    const closeMenu=()=>setMenuOpen(false);
    window.addEventListener('hashchange',closeMenu);
    document.addEventListener('devmentor:screen-change',closeMenu);
    return()=>{
      window.removeEventListener('hashchange',closeMenu);
      document.removeEventListener('devmentor:screen-change',closeMenu);
    };
  },[]);
  const roles = auth?.user?.roles ?? (mentor ? ['mentor'] : ['mentee']);
  const hasSessions = roles.includes('mentee') || roles.includes('mentor');
  return <AppShell user={{displayName:auth?.user?.displayName ?? (mentor?'Alex Laurent':'Jordan Lee')}}
    nav={<><Button className="proto-menu-toggle" intent="neutral" appearance="stroke" aria-expanded={menuOpen} aria-controls={menuId} onClick={()=>setMenuOpen(value=>!value)}><Menu aria-hidden="true"/>Menu</Button><div id={menuId} className={`proto-workspace-links${menuOpen ? ' is-open' : ''}`} onClick={()=>setMenuOpen(false)}>{roles.includes('operator') && <><button onClick={()=>navigate('s24')}><ShieldCheck aria-hidden="true"/>Operator home</button><button onClick={()=>navigate('s25')}><Users aria-hidden="true"/>Users</button></>}{hasSessions && <><button onClick={()=>navigate('s6')}><CalendarDays aria-hidden="true" />My sessions</button>{(!auth || auth.hasSession) && <button onClick={()=>navigate('s9')}><FileText aria-hidden="true" />Private notes</button>}</>}{roles.includes('mentor') && <><button onClick={()=>navigate('s11')}><SlidersHorizontal aria-hidden="true" />Mentor workspace</button><button onClick={()=>navigate('s27')}><UserRound aria-hidden="true"/>Edit profile</button><button onClick={()=>navigate('s28')}><ShieldCheck aria-hidden="true"/>Payout settings</button></>}<button onClick={()=>navigate('s19')}><UserRound aria-hidden="true" />Browse mentors</button></div></>}
    actions={auth ? <Button size="sm" intent="neutral" appearance="stroke" disabled={auth.busy} onClick={() => void auth.logout()}>Sign out</Button> : <Button size="sm" intent="neutral" appearance="stroke" onClick={()=>navigate(mentor?'s6':'s11')}>{mentor?'Mentee view':'Mentor view'}</Button>}>
    {(auth?.notice === 'forbidden' || auth?.notice === 'operator-revoked' || auth?.notice === 'service-unavailable') && <div className="proto-workspace-notice"><AuthFeedback state={auth.notice}/></div>}
    {children}
  </AppShell>;
}
