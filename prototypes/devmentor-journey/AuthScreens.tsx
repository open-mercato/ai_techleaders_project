import { useState } from 'react';
import { Mail, ShieldCheck, Users, ExternalLink } from 'lucide-react';
import { AccountForm, AuthFeedback, Button, Card } from '@devmentor/ui';
import { AuthLayout, DataTable } from '@devmentor/ui/backend';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, loginSchema, registrationSchema, type AuthDemoFailure, type AuthDemoGithubOutcome } from './auth-model';
import { authDemo, AUTH_ENDPOINT } from './auth-runtime';
import { mentorDemo } from './mentor-runtime';
import { useAuth } from './auth-context';
import { PublicPage, Screen, Workspace } from './Frame';
import { navigate } from './navigation';
import './auth-flow.css';

export function AuthDemoControls() {
  const auth = useAuth()!;
  return <aside className="proto-auth-controls" aria-label="Authentication demo controls">
    <div><h2>Authentication demo controls</h2><p>Fictional accounts only. Requests stay in this browser; reload to reset. No email is sent and GitHub is not contacted.</p></div>
    <details><summary>Demo email accounts and password</summary><p>Password for email accounts: <code>{DEMO_PASSWORD}</code></p><ul>{DEMO_ACCOUNTS.filter(account => account.source !== 'github').map(account => <li key={account.id}><strong>{account.email}</strong><span>{account.roles.join(', ')}{account.source === 'pending' ? ' (email not verified)' : ''}</span></li>)}</ul><p>GitHub-only account: github@example.test. New GitHub account: robin@example.test.</p></details>
    <div className="proto-auth-control-grid">
      <label>Next request result<select value={auth.failure} onChange={e => auth.setFailure(e.target.value as AuthDemoFailure)}><option value="none">Normal response</option><option value="rate-limited">Too many attempts (once)</option><option value="service-unavailable">Service unavailable (once)</option><option value="mail-unavailable">Email delivery failed (registration only)</option></select></label>
      <label>Verification link<select value={auth.verification} onChange={e => auth.setVerification(e.target.value as 'valid' | 'expired' | 'invalid')}><option value="valid">Valid</option><option value="expired">Expired</option><option value="invalid">Invalid</option></select></label>
      <label className="proto-auth-checkbox"><input type="checkbox" checked={auth.emailDisabled} onChange={e => auth.setEmailDisabled(e.target.checked)}/>Preview GitHub-only release</label>
    </div>
    <div className="dm-product-actions"><Button size="sm" intent="neutral" appearance="stroke" disabled={!auth.user || auth.busy} onClick={auth.expire}>Expire demo session</Button><Button size="sm" intent="neutral" appearance="stroke" onClick={() => auth.operatorEligible(false)}>Remove Sam’s operator access</Button><Button size="sm" intent="neutral" appearance="stroke" onClick={() => auth.operatorEligible(true)}>Restore Sam’s operator access</Button></div>
    <p className="dm-product-caption">A selected failure affects one request. Choose Normal response to model the end of a cooldown. These controls simulate server responses; they do not grant product roles.</p>
  </aside>;
}

export function AuthScreens() {
  const auth = useAuth()!;
  const [formRevision, setFormRevision] = useState(0);
  const retryRegistration = () => { setFormRevision(value => value + 1); auth.switchMode('s20'); };
  const recovery = auth.formError === 'unverified-email' || auth.formError === 'github-link';
  const noop = () => {};
  return <>
    <Screen id="s12" title="Sign in" description="Email and GitHub sign-in with role-aware continuation and recovery." refs={['E01', '#12', '#13', '#14']}>
      <AuthLayout title={auth.returnTo === 's4' ? 'Sign in to book your session' : auth.returnTo === 's26' ? 'Sign in to accept your invitation' : 'Welcome back'} description={auth.returnTo === 's26' ? 'After signing in, you will return to your mentor invitation.' : 'Sign in to see your sessions, written answers and private notes.'} footer={<Button size="sm" intent="neutral" appearance="ghost" onClick={() => navigate(auth.returnTo === 's4' ? 's3' : auth.returnTo === 's26' ? 's26' : 's17')}>{auth.returnTo === 's4' ? 'Back to your selected time' : auth.returnTo === 's26' ? 'Back to invitation' : 'Back to home'}</Button>}>
        <AccountForm mode="sign-in" schema={loginSchema} endpoint={`${AUTH_ENDPOINT}/login`} onSuccess={noop} onGitHub={() => navigate('s23')} onSwitchMode={() => auth.switchMode('s20')} emailDisabled={auth.emailDisabled} notice={auth.notice && auth.notice !== 'check-inbox' && auth.notice !== 'verified' ? <AuthFeedback state={auth.notice}/> : undefined}/>
        {recovery && <Button className="proto-full-button" intent="neutral" appearance="stroke" onClick={retryRegistration}>Verify your email</Button>}
      </AuthLayout>
    </Screen>
    <Screen id="s20" title="Create an account" description="New email accounts remain signed out until email verification." refs={['E01', '#13']}>
      <AuthLayout title="Create your account" description="Find a mentor, book a session and keep your session notes in one place." footer={<Button intent="neutral" appearance="ghost" onClick={() => navigate('s17')}>Back to home</Button>}>
        <AccountForm key={formRevision} mode="register" schema={registrationSchema} endpoint={`${AUTH_ENDPOINT}/register`} initialValues={auth.pendingEmail ? { email: auth.pendingEmail } : undefined} onSuccess={noop} onGitHub={() => navigate('s23')} onSwitchMode={() => auth.switchMode('s12')} emailDisabled={auth.emailDisabled}/>
        {auth.formError === 'github-account' && <Button intent="neutral" appearance="stroke" onClick={() => navigate('s23')}>Use GitHub sign-in</Button>}
      </AuthLayout>
    </Screen>
    <Screen id="s21" title="Check your inbox" description="Registration creates no session. The email preview opens a simulated verification link." refs={['E01', '#13']}>
      <AuthLayout title="Check your inbox" description={auth.pendingEmail ? `Use the verification link for ${auth.pendingEmail} to finish creating your account.` : 'Create an account to receive a verification link.'} footer={<Button intent="neutral" appearance="ghost" onClick={() => auth.switchMode('s12')}>Back to sign in</Button>}>
        <div className="proto-stack">{auth.notice === 'service-unavailable' && <AuthFeedback state="service-unavailable"/>}<p>Until you verify your email, your account cannot open private pages.</p><Card className="proto-email-preview"><p className="proto-eyebrow"><Mail aria-hidden="true"/>Demo email preview</p><h2>Verify your DevMentor email</h2><p>This is a local preview of the email. It does not send a message to your inbox.</p><Button className="proto-full-button" disabled={!auth.pendingEmail || auth.busy} onClick={() => void auth.verify()}><ExternalLink aria-hidden="true"/>Open verification link</Button></Card><Button intent="neutral" appearance="stroke" onClick={retryRegistration}>Use a different email or request a new link</Button></div>
      </AuthLayout>
    </Screen>
    <Screen id="s22" title="Email verification" description="Valid links create a session; expired and invalid links offer a way to start again." refs={['E01', '#13']}>
      <AuthLayout title={auth.notice === 'verified' ? 'Your email is verified' : 'Check your verification link'} description={auth.notice === 'verified' ? 'Your account is ready.' : 'You can request another link using the same email address.'}>
        <div className="proto-stack"><AuthFeedback state={auth.notice === 'verified' ? 'verified' : auth.notice === 'verification-expired' ? 'verification-expired' : auth.notice === 'service-unavailable' || auth.notice === 'rate-limited' ? auth.notice : 'verification-invalid'}/>{auth.notice === 'verified' ? <Button className="proto-full-button" onClick={auth.complete}>{auth.returnTo === 's4' ? 'Continue with your booking' : auth.returnTo === 's26' ? 'Return to invitation' : 'Open my workspace'}</Button> : <Button className="proto-full-button" onClick={retryRegistration}>Request a new verification link</Button>}<Button intent="neutral" appearance="ghost" onClick={() => auth.switchMode('s12')}>Back to sign in</Button></div>
      </AuthLayout>
    </Screen>
    <Screen id="s23" title="GitHub response preview" description="Choose a fictional GitHub account and callback result. No GitHub connection is made." refs={['E01', '#12']}>
      <PublicPage><div className="proto-narrow proto-stack"><div className="proto-page-heading"><p className="proto-eyebrow">Local OAuth simulation</p><h1>Preview a GitHub sign-in</h1><p>Choose the account and response to test. In the application, GitHub handles this step.</p></div><Card className="dm-product-panel proto-stack">
        <label className="dm-field">GitHub demo account<select className="dm-input" value={auth.githubAccount} disabled={auth.busy} onChange={e => auth.setGithubAccount(e.target.value)}>{DEMO_ACCOUNTS.map(account => <option value={account.id} key={account.id}>{account.name} ({account.email})</option>)}</select></label>
        <label className="dm-field">GitHub response<select className="dm-input" value={auth.githubOutcome} disabled={auth.busy} onChange={e => auth.setGithubOutcome(e.target.value as AuthDemoGithubOutcome)}><option value="success">Success</option><option value="cancelled">User cancelled</option><option value="state">Invalid or expired state</option><option value="unavailable">GitHub unavailable</option><option value="email">No verified primary email</option><option value="link">Local email not verified</option></select></label>
        <div className="dm-product-actions proto-auth-footer"><Button intent="neutral" appearance="ghost" disabled={auth.busy} onClick={() => void auth.github(true)}>Cancel sign-in</Button><Button disabled={auth.busy} onClick={() => void auth.github()}>{auth.busy ? 'Checking response…' : 'Continue with demo account'}</Button></div>
      </Card></div></PublicPage>
    </Screen>
    <Screen id="s24" title="Operator home" description="Operator home takes priority when an account also has a mentor role." refs={['E01', '#14']}><Workspace><div className="proto-stack"><div className="proto-page-heading"><p className="proto-eyebrow">Operations</p><h1>Operator workspace</h1><p>Open the user directory to review the demo accounts and their assigned roles.</p></div><Card className="dm-product-panel proto-stack"><ShieldCheck aria-hidden="true"/><h2>Account access</h2><p>Roles come from account records and operator configuration. Users cannot assign themselves a role.</p><Button onClick={() => navigate('s25')}><Users aria-hidden="true"/>View users</Button></Card></div></Workspace></Screen>
    <Screen id="s25" title="Operator users" description="Operator-only directory demonstrates access to a protected admin page." refs={['E01', '#14']}><Workspace><div className="proto-stack"><div className="proto-page-heading"><h1>Users</h1><p>Fictional records for testing account access. Role editing is outside this prototype.</p></div><DataTable caption="Demo users" getRowId={row => row.id} rows={authDemo.getUsers()} columns={[{key:'displayName',header:'Name'},{key:'email',header:'Email'},{key:'id',header:'Payout setup',render:row=>row.roles.includes('mentor') ? <span className="dm-meta-chip">{{incomplete:'Not set up',pending:'Under review',enabled:'Enabled',restricted:'Needs attention'}[mentorDemo.getProfile(row).connect]}</span> : 'Not a mentor'},{key:'roles',header:'Roles',render:row => <span className="dm-meta-group">{(row.id === 'sam' && auth.user?.id === 'sam' ? auth.user.roles : row.roles).map(role => <span className="dm-meta-chip" key={role}>{role}</span>)}</span>}]}/></div></Workspace></Screen>
  </>;
}
