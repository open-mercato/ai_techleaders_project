import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiCall } from '@devmentor/ui/backend';
import type { AuthFeedbackState } from '../../packages/ui/src/components/auth/AuthFeedback';
import { allowedScreen, safeDestination, homeFor, type DemoUser, type AuthDemoResult, type AuthDemoFailure, type AuthDemoGithubOutcome } from './auth-model';
import { authDemo, AUTH_ENDPOINT } from './auth-runtime';
import { navigate } from './navigation';

const authScreens = new Set(['s12', 's20', 's21', 's22', 's23']);
export const sessionDetailScreens = new Set(['s7', 's8', 's9', 's10', 's15', 's18']);
export function useAuthController(hasSelectedTime: boolean, hasConfirmedBooking = false) {
  const [user, setUser] = useState<DemoUser | null>(authDemo.getSession);
  const [screen, setScreen] = useState(location.hash.slice(1) || 's17');
  const [notice, setNotice] = useState<AuthFeedbackState | null>(null);
  const [formError, setFormError] = useState<AuthFeedbackState | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [failure, setFailureState] = useState<AuthDemoFailure>('none');
  const [githubAccount, setGithubAccount] = useState('jordan');
  const [githubOutcome, setGithubOutcome] = useState<AuthDemoGithubOutcome>('success');
  const [verification, setVerification] = useState<'valid' | 'expired' | 'invalid'>('valid');
  const [emailDisabled, setEmailDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const previous = useRef(screen);
  const destination = useRef<string | null>(null);
  const redirectingToSignIn = useRef(false);
  const selected = useRef(hasSelectedTime);
  const confirmed = useRef(hasConfirmedBooking);
  useEffect(() => { selected.current = hasSelectedTime; }, [hasSelectedTime]);
  useEffect(() => { confirmed.current = hasConfirmedBooking; }, [hasConfirmedBooking]);
  useLayoutEffect(() => {
    const currentScreen = document.getElementById(screen);
    if (!currentScreen?.classList.contains('is-current')) return;
    // The engine may focus a guard heading that React replaces after sign-in.
    const heading = currentScreen.querySelector<HTMLElement>('.frame h1, .frame h2');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [screen, user?.id]);
  function hasDemoSession(current: DemoUser | null) {
    return !!current && (confirmed.current || ['jordan', 'alex', 'taylor', 'sam'].includes(current.id));
  }
  function remember(id: string | null) { destination.current = id; setReturnTo(id); }
  function complete() {
    const current = authDemo.getSession();
    if (current) { setNotice(null); navigate(safeDestination(current, destination.current)); remember(null); }
  }
  useEffect(() => {
    const onScreen = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      const current = authDemo.getSession();
      setUser(current);
      let redirect: string | null = null;
      if (next === 's12' && current) redirect = homeFor(current.roles);
      else if (!allowedScreen(current, next)) {
        if (!current) { remember(next); redirectingToSignIn.current = true; redirect = 's12'; }
        else { setNotice('forbidden'); redirect = homeFor(current.roles); }
      } else if (current && sessionDetailScreens.has(next) && !hasDemoSession(current)) {
        setNotice(null); remember(null); redirect = 's6';
      } else if (next === 's12' && !authScreens.has(previous.current)) {
        if (!redirectingToSignIn.current) remember(previous.current === 's3' && selected.current ? 's4' : null);
        setFormError(null);
      }
      if (next === 's12') redirectingToSignIn.current = false;
      if (redirect) {
        const target = redirect;
        queueMicrotask(() => navigate(target));
        return;
      }
      previous.current = next;
      setScreen(next);
    };
    const onResult = (event: Event) => {
      const { action, result } = (event as CustomEvent<{ action: string; result: AuthDemoResult }>).detail;
      setUser(authDemo.getSession());
      setPendingEmail(authDemo.getPendingEmail());
      setFailureState('none');
      if (action === 'login' || action === 'register') setNotice(null);
      if (!result.ok) {
        const state = result.error.state ?? null;
        setFormError(state);
        if (action === 'github') { setNotice(state); navigate('s12'); }
        if (action === 'verify') { setNotice(state); navigate('s22'); }
        return;
      }
      setFormError(null);
      if (action === 'register') { setNotice('check-inbox'); navigate('s21'); }
      if (action === 'verify') { setNotice('verified'); navigate('s22'); }
      if (action === 'logout') { setNotice('signed-out'); remember(null); navigate('s17'); }
      if (action === 'login' || action === 'github') {
        setNotice(null);
        if (result.data.user) navigate(safeDestination(result.data.user, destination.current));
        remember(null);
      }
    };
    document.addEventListener('devmentor:screen-change', onScreen);
    document.addEventListener('devmentor:auth-result', onResult);
    return () => {
      document.removeEventListener('devmentor:screen-change', onScreen);
      document.removeEventListener('devmentor:auth-result', onResult);
    };
  }, []);
  async function request(action: 'verify' | 'github' | 'logout', body: unknown) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try {
      const result = await apiCall(`${AUTH_ENDPOINT}/${action}`, { body });
      if (!result.ok && ['network_error', 'invalid_response'].includes(result.error.code)) setNotice('service-unavailable');
    } finally { busyRef.current = false; setBusy(false); }
  }
  function expire() {
    remember(allowedScreen(user, screen) && !authScreens.has(screen) ? screen : null);
    redirectingToSignIn.current = true;
    authDemo.expire(); setUser(null); setNotice('session-expired'); setFormError(null); navigate('s12');
  }
  function operatorEligible(value: boolean) {
    authDemo.setOperatorEligible(value);
    const current = authDemo.getSession(); setUser(current);
    if (value) setNotice((previousNotice) => previousNotice === 'operator-revoked' ? null : previousNotice);
    if (current?.id === 'sam' && !value) {
      setNotice('operator-revoked');
      if (!allowedScreen(current, screen)) navigate(homeFor(current.roles));
    }
  }
  function setFailure(value: AuthDemoFailure) { authDemo.setFailure(value); setFailureState(value); }
  function switchMode(id: 's12' | 's20') { setNotice(null); setFormError(null); navigate(id); }
  const hasSession = !!user && (hasConfirmedBooking || ['jordan', 'alex', 'taylor', 'sam'].includes(user.id));
  return { user, hasSession, screen, notice, formError, pendingEmail, returnTo, failure, githubAccount, githubOutcome, verification, emailDisabled, busy,
    setFailure, setGithubAccount, setGithubOutcome, setVerification, setEmailDisabled, switchMode, complete, expire, operatorEligible,
    verify: () => request('verify', { mode: verification }),
    github: (cancel = false) => request('github', { accountId: githubAccount, outcome: cancel ? 'cancelled' : githubOutcome }),
    logout: () => request('logout', {}),
  };
}
export type AuthFlow = ReturnType<typeof useAuthController>;
export const AuthContext = createContext<AuthFlow | null>(null);
export const useAuth = () => useContext(AuthContext);
