export function navigate(screenId: string) {
  document.dispatchEvent(new CustomEvent('devmentor:navigate', { detail: screenId }));
}

export function getSignInDestination(previousScreen: string, hasSelectedTime: boolean): 's4' | 's6' {
  return previousScreen === 's3' && hasSelectedTime ? 's4' : 's6';
}

export function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.focus({ preventScroll: true });
  target.scrollIntoView({ behavior: 'instant', block: 'start' });
}
