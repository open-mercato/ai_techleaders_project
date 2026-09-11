import { useEffect, useReducer } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { mockTopLayerSelectors } from '../../packages/ui/src/components/ui/overlay.test-helpers';
import { AuthContext, useAuthController } from './auth-context';
import { AuthScreens } from './AuthScreens';
import { DEMO_PASSWORD } from './auth-model';
import { authDemo, authHandlers } from './auth-runtime';
import type { InvitationMode } from './mentor-model';
import { mentorDemo, mentorHandlers } from './mentor-runtime';
import { MentorScreens } from './MentorScreens';
import { navigate } from './navigation';

const server = setupServer(...authHandlers, ...mentorHandlers);
const preview = vi.fn();
const clipboard = { writeText: vi.fn<(value: string) => Promise<void>>() };
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const engine = (event: Event) => {
  const id = (event as CustomEvent<string>).detail;
  history.replaceState(null, '', `#${id}`);
  document.querySelectorAll('.screen').forEach(element => element.classList.toggle('is-current', element.id === id));
  document.dispatchEvent(new CustomEvent('devmentor:screen-change', { detail: id }));
};

function Harness({ mode = 'valid' }: { mode?: InvitationMode }) {
  const auth = useAuthController(false);
  const [, redraw] = useReducer(count => count + 1, 0);
  useEffect(() => {
    document.addEventListener('devmentor:mentor-result', redraw);
    return () => document.removeEventListener('devmentor:mentor-result', redraw);
  }, []);
  const profile = auth.user?.roles.includes('mentor') ? mentorDemo.getProfile(auth.user) : null;
  return <AuthContext.Provider value={auth}>
    <output aria-label="Current screen">{auth.screen}</output>
    <AuthScreens />
    <MentorScreens profile={profile} invitationMode={mode} onPreview={preview} />
  </AuthContext.Provider>;
}

function region(title: string) { return within(screen.getByRole('region', { name: title })); }
function currentScreen() { return screen.getByLabelText('Current screen').textContent; }
async function go(id: string) { await act(async () => { navigate(id); }); }
function renderAs(accountId: string | null, initialScreen: string, mode: InvitationMode = 'valid') {
  if (accountId) authDemo.github(accountId, 'success');
  history.replaceState(null, '', `#${initialScreen}`);
  return render(<Harness mode={mode}/>);
}
function fillProfile() {
  const page = region('Edit mentor profile');
  fireEvent.change(page.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Taylor Morgan' } });
  fireEvent.change(page.getByRole('textbox', { name: 'About your mentoring' }), { target: { value: 'I help developers trace React state changes and test their forms.' } });
  fireEvent.change(page.getByRole('textbox', { name: 'Public work link' }), { target: { value: 'https://github.com/example' } });
  fireEvent.click(page.getByRole('checkbox', { name: 'React' }));
  return page;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
  document.addEventListener('devmentor:navigate', engine);
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
});
beforeEach(() => {
  authDemo.reset(); mentorDemo.reset(); preview.mockReset(); clipboard.writeText.mockReset().mockResolvedValue(undefined);
  history.replaceState(null, '', '#s26');
  mockTopLayerSelectors();
});
afterEach(() => { cleanup(); server.resetHandlers(); vi.restoreAllMocks(); });
afterAll(() => {
  document.removeEventListener('devmentor:navigate', engine); server.close();
  if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
  else Reflect.deleteProperty(navigator, 'clipboard');
});

it('takes an invited mentee through sign-in and acceptance to an empty mentor workspace with a deadline', async () => {
  renderAs(null, 's26');
  fireEvent.click(region('Mentor invitation').getByRole('button', { name: 'Sign in to accept' }));
  expect(currentScreen()).toBe('s12');
  const login = region('Sign in');
  fireEvent.change(login.getByLabelText(/^Email address/), { target: { value: 'jordan@example.test' } });
  fireEvent.change(login.getByLabelText(/^Password/), { target: { value: DEMO_PASSWORD } });
  fireEvent.click(login.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(currentScreen()).toBe('s26'));
  expect(region('Mentor invitation').getByText('Accepting as jordan@example.test')).toBeTruthy();
  expect(region('Mentor workspace').queryByRole('spinbutton')).toBeNull();
  fireEvent.click(region('Mentor invitation').getByRole('button', { name: 'Accept invitation' }));
  await waitFor(() => expect(currentScreen()).toBe('s11'));
  const home = region('Mentor workspace');
  expect(home.getByRole('heading', { name: 'Get ready for your first session' })).toBeTruthy();
  expect(home.getByText('0 of 3 steps complete')).toBeTruthy();
  expect(home.getByText(/Publish by Thu 24 September/)).toBeTruthy();
  expect(home.getByText('No times published')).toBeTruthy();
  expect(authDemo.getSession()?.roles).toEqual(['mentee', 'mentor']);
  fireEvent.click(home.getByRole('button', { name: 'Complete profile' }));
  expect(currentScreen()).toBe('s27');
  expect(region('Edit mentor profile').getByRole<HTMLInputElement>('textbox', { name: 'Display name' }).value).toBe('Jordan Lee');
});

it.each([
  ['expired', 'This invitation has expired'],
  ['invalid', 'We could not find this invitation'],
  ['used', 'This invitation has already been used'],
] as const)('offers recovery for an %s invitation without granting mentor access', (mode, heading) => {
  renderAs('jordan', 's26', mode);
  const invitation = region('Mentor invitation');
  expect(invitation.getByRole('heading', { name: heading })).toBeTruthy();
  expect(invitation.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  expect(authDemo.getSession()?.roles).toEqual(['mentee']);
  expect(region('Edit mentor profile').queryByRole('textbox')).toBeNull();
});

it('keeps invitation acceptance available after a failed request and grants the role only on retry', async () => {
  renderAs('jordan', 's26');
  mentorDemo.setFailure(true);
  fireEvent.click(region('Mentor invitation').getByRole('button', { name: 'Accept invitation' }));
  await waitFor(() => expect(region('Mentor invitation').getByRole('alert').textContent).toContain('We could not save this change.'));
  expect(authDemo.getSession()?.roles).toEqual(['mentee']);
  expect(currentScreen()).toBe('s26');
  fireEvent.click(region('Mentor invitation').getByRole('button', { name: 'Accept invitation' }));
  await waitFor(() => expect(currentScreen()).toBe('s11'));
  expect(authDemo.getSession()?.roles).toEqual(['mentee', 'mentor']);
});

it('explains missing publication requirements, keeps failed edits and publishes saved content with copy recovery', async () => {
  renderAs('taylor', 's27');
  let editor = region('Edit mentor profile');
  const previewButton = () => editor.getByRole<HTMLButtonElement>('button', { name: 'Preview public page' });
  expect(previewButton().disabled).toBe(false);
  expect(previewButton().hasAttribute('aria-describedby')).toBe(false);
  fireEvent.click(editor.getByRole('button', { name: 'Publish profile' }));
  await waitFor(() => expect(editor.getByRole('alert').textContent).toContain('Describe the work you can help with.'));
  expect(editor.getByRole('alert').textContent).toContain('Choose at least one technology.');
  expect(mentorDemo.getPublic('taylor')).toBeNull();
  fireEvent.click(editor.getByRole('button', { name: 'Save profile' }));
  expect(editor.getByText('Describe the problems you can help with.')).toBeTruthy();
  expect(document.activeElement).toBe(editor.getByRole('textbox', { name: 'About your mentoring' }));
  editor = fillProfile();
  expect(editor.getByText('Save your changes before publishing or previewing.')).toBeTruthy();
  expect(editor.getByRole<HTMLButtonElement>('button', { name: 'Publish profile' }).disabled).toBe(true);
  expect(previewButton().disabled).toBe(true);
  expect(document.getElementById(previewButton().getAttribute('aria-describedby')!)?.textContent).toBe('Save your changes before publishing or previewing.');
  mentorDemo.setFailure(true);
  fireEvent.click(editor.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(editor.getAllByRole('alert').some(alert => alert.textContent?.includes('We could not save this change.'))).toBe(true));
  expect(editor.getByRole<HTMLInputElement>('textbox', { name: 'Public work link' }).value).toBe('https://github.com/example');
  expect(editor.getByRole<HTMLInputElement>('checkbox', { name: 'React' }).checked).toBe(true);
  fireEvent.click(editor.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(editor.getByText('Profile saved. Publish it when you are ready.')).toBeTruthy());
  expect(editor.queryByText('Save your changes before publishing or previewing.')).toBeNull();
  expect(editor.getByRole<HTMLButtonElement>('button', { name: 'Publish profile' }).disabled).toBe(false);
  expect(previewButton().disabled).toBe(false);
  expect(previewButton().hasAttribute('aria-describedby')).toBe(false);
  fireEvent.click(editor.getByRole('button', { name: 'Publish profile' }));
  await waitFor(() => expect(editor.getByText('Published', { exact: true })).toBeTruthy());
  expect(mentorDemo.getPublic('taylor')).toMatchObject({ displayName: 'Taylor Morgan', stacks: ['React'], description: 'I help developers trace React state changes and test their forms.' });
  fireEvent.click(editor.getByRole('button', { name: 'Copy profile link' }));
  await waitFor(() => expect(editor.getByText('Link copied.')).toBeTruthy());
  const link = editor.getByRole<HTMLInputElement>('textbox', { name: 'Local preview link' }).value;
  expect(clipboard.writeText).toHaveBeenLastCalledWith(link);
  expect(new URL(link).searchParams.get('mentor')).toBe('taylor');
  expect(new URL(link).hash).toBe('#s1');
  clipboard.writeText.mockRejectedValueOnce(new Error('Clipboard not available'));
  fireEvent.click(editor.getByRole('button', { name: 'Copy profile link' }));
  await waitFor(() => expect(editor.getByRole('alert').textContent).toContain('Select the link above and copy it manually.'));
  fireEvent.click(editor.getByRole('button', { name: 'Preview public page' }));
  expect(preview).toHaveBeenLastCalledWith('taylor');
});

it('validates both price bounds and start times, then updates the setup checklist from saved data', async () => {
  renderAs('taylor', 's11');
  const home = region('Mentor workspace');
  const price25 = home.getByRole('spinbutton', { name: '25-minute price (PLN)' });
  const price50 = home.getByRole('spinbutton', { name: '50-minute price (PLN)' });
  fireEvent.change(price25, { target: { value: '89' } });
  fireEvent.change(price50, { target: { value: '1201' } });
  fireEvent.click(home.getByRole('button', { name: 'Save session prices' }));
  expect(home.getByText('The minimum for 25 minutes is PLN 90.')).toBeTruthy();
  expect(home.getByText('The maximum for 50 minutes is PLN 1,200.')).toBeTruthy();
  expect(document.activeElement).toBe(price25);
  fireEvent.change(price25, { target: { value: '600' } });
  fireEvent.change(price50, { target: { value: '180' } });
  fireEvent.click(home.getByRole('button', { name: 'Save session prices' }));
  await waitFor(() => expect(home.getByText('Prices saved. Existing bookings keep their original price.')).toBeTruthy());
  expect(home.getByText('1 of 3 steps complete')).toBeTruthy();
  expect(mentorDemo.getProfile(authDemo.getSession()!).prices).toEqual({ 25: 600, 50: 180 });
  const startsAt = home.getByLabelText(/^Session starts at/);
  fireEvent.change(startsAt, { target: { value: '2026-09-10T09:59' } });
  fireEvent.click(home.getByRole('button', { name: 'Publish available time' }));
  expect(home.getByText('Choose 10 September 2026 at 10:00 UTC or later.')).toBeTruthy();
  fireEvent.change(startsAt, { target: { value: '2026-09-12T12:00' } });
  fireEvent.click(home.getByRole('button', { name: 'Publish available time' }));
  await waitFor(() => expect(home.getByText('2 of 3 steps complete')).toBeTruthy());
  expect(home.getByText('Time saved. It becomes bookable when your profile is published and both prices are set.')).toBeTruthy();
  expect(home.getByRole('row', { name: /Sat 12 September, 12:00 Open Remove time/ })).toBeTruthy();
  expect(mentorDemo.getPublic('taylor')).toBeNull();
});

it('discards an unsaved profile draft on Cancel and restores the last saved fields when returning', async () => {
  renderAs('taylor', 's27');
  const editor = fillProfile();
  fireEvent.click(editor.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(editor.getByText('Profile saved. Publish it when you are ready.')).toBeTruthy());
  fireEvent.change(editor.getByRole('textbox', { name: 'Display name' }), { target: { value: 'Unsaved name' } });
  fireEvent.change(editor.getByRole('textbox', { name: 'About your mentoring' }), { target: { value: 'Discard this draft.' } });
  fireEvent.click(editor.getByRole('checkbox', { name: 'React' }));
  fireEvent.click(editor.getByRole('checkbox', { name: 'Python' }));
  expect(editor.getByText('Save your changes before publishing or previewing.')).toBeTruthy();
  expect(editor.getByRole<HTMLButtonElement>('button', { name: 'Preview public page' }).disabled).toBe(true);
  fireEvent.click(editor.getByRole('button', { name: 'Cancel' }));
  expect(currentScreen()).toBe('s11');
  await go('s27');
  expect(editor.getByRole<HTMLInputElement>('textbox', { name: 'Display name' }).value).toBe('Taylor Morgan');
  expect(editor.getByRole<HTMLTextAreaElement>('textbox', { name: 'About your mentoring' }).value).toBe('I help developers trace React state changes and test their forms.');
  expect(editor.getByRole<HTMLInputElement>('checkbox', { name: 'React' }).checked).toBe(true);
  expect(editor.getByRole<HTMLInputElement>('checkbox', { name: 'Python' }).checked).toBe(false);
  expect(editor.queryByText('Save your changes before publishing or previewing.')).toBeNull();
  expect(editor.getByRole<HTMLButtonElement>('button', { name: 'Preview public page' }).disabled).toBe(false);
});

it('asks before removing a time, supports retry and explains why a paid booking cannot be removed', async () => {
  renderAs('alex', 's11');
  const home = region('Mentor workspace');
  const availableRow = () => home.getByRole('row', { name: /Thu 10 September, 13:00 Open Remove time/ });
  fireEvent.click(within(availableRow()).getByRole('button', { name: 'Remove time' }));
  let dialog = within(await screen.findByRole('alertdialog', { name: 'Remove this available time?' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Keep time' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(availableRow()).toBeTruthy();
  fireEvent.click(within(availableRow()).getByRole('button', { name: 'Remove time' }));
  dialog = within(await screen.findByRole('alertdialog', { name: 'Remove this available time?' }));
  mentorDemo.setFailure(true);
  fireEvent.click(dialog.getByRole('button', { name: 'Remove time' }));
  await waitFor(() => expect(dialog.getByRole('alert').textContent).toContain('We could not save this change.'));
  fireEvent.click(dialog.getByRole('button', { name: 'Remove time' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(home.queryByRole('row', { name: /Thu 10 September, 13:00/ })).toBeNull();
  const booked = home.getByRole('row', { name: /Thu 10 September, 10:00 Booked Cancellation options/ });
  fireEvent.click(within(booked).getByRole('button', { name: 'Cancellation options' }));
  dialog = within(await screen.findByRole('alertdialog', { name: 'This time has a booking' }));
  expect(dialog.getByText(/Contact the DevMentor founders to arrange cancellation/)).toBeTruthy();
  expect(dialog.queryByRole('button', { name: 'Remove time' })).toBeNull();
  fireEvent.click(dialog.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(mentorDemo.getPublic('alex')?.slots.find(slot => slot.id === 'morning')?.blockedReason).toBe('Booked');
});

it.each([
  ['enabled', 'Payouts enabled'], ['pending', 'Payout setup is under review'],
  ['incomplete', 'Finish payout setup'], ['restricted', 'Your payout account needs attention'],
] as const)('returns from the Stripe simulation with %s payout state', async (state, heading) => {
  renderAs('alex', 's28');
  fireEvent.click(region('Payout settings').getByRole('button', { name: 'Set up payouts' }));
  expect(currentScreen()).toBe('s29');
  const stripe = region('Stripe response preview');
  expect(stripe.getByText(/No financial details are collected and Stripe is not contacted/)).toBeTruthy();
  fireEvent.change(stripe.getByRole('combobox', { name: 'Return status' }), { target: { value: state } });
  fireEvent.click(stripe.getByRole('button', { name: 'Return to DevMentor' }));
  await waitFor(() => expect(currentScreen()).toBe('s28'));
  expect(region('Payout settings').getByRole('heading', { name: heading })).toBeTruthy();
  expect(mentorDemo.getProfile(authDemo.getSession()!).connect).toBe(state);
});

it('keeps the chosen Stripe response after a failed return, retries and recovers a failed status refresh', async () => {
  renderAs('alex', 's29');
  const stripe = region('Stripe response preview');
  fireEvent.change(stripe.getByRole('combobox', { name: 'Return status' }), { target: { value: 'restricted' } });
  mentorDemo.setFailure(true);
  fireEvent.click(stripe.getByRole('button', { name: 'Return to DevMentor' }));
  await waitFor(() => expect(stripe.getByRole('alert').textContent).toContain('We could not save this change.'));
  expect(currentScreen()).toBe('s29');
  expect(stripe.getByRole<HTMLSelectElement>('combobox', { name: 'Return status' }).value).toBe('restricted');
  fireEvent.click(stripe.getByRole('button', { name: 'Return to DevMentor' }));
  await waitFor(() => expect(currentScreen()).toBe('s28'));
  const payouts = region('Payout settings');
  expect(payouts.getByRole('heading', { name: 'Your payout account needs attention' })).toBeTruthy();
  mentorDemo.setFailure(true);
  fireEvent.click(payouts.getByRole('button', { name: 'Refresh payout status' }));
  await waitFor(() => expect(payouts.getByRole('alert').textContent).toContain('We could not save this change.'));
  fireEvent.click(payouts.getByRole('button', { name: 'Refresh payout status' }));
  await waitFor(() => expect(payouts.queryByRole('alert')).toBeNull());
  fireEvent.click(payouts.getByRole('button', { name: 'Complete account requirements' }));
  expect(currentScreen()).toBe('s29');
  fireEvent.click(stripe.getByRole('button', { name: 'Cancel and return' }));
  expect(currentScreen()).toBe('s28');
});

it.each([null, 'jordan'])('keeps private mentor details and payout controls out of %s account views', async account => {
  renderAs(account, 's26');
  for (const title of ['Mentor workspace', 'Edit mentor profile', 'Payout settings', 'Stripe response preview']) {
    const page = region(title);
    expect(page.queryByRole('textbox')).toBeNull();
    expect(page.queryByRole('spinbutton')).toBeNull();
    expect(page.queryByRole('combobox')).toBeNull();
    expect(page.queryByRole('button', { name: 'Refresh payout status' })).toBeNull();
  }
  await go('s28');
  await waitFor(() => expect(currentScreen()).toBe(account ? 's6' : 's12'));
});
