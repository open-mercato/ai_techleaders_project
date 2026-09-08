import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { getSignInDestination, scrollToSection } from './navigation.ts';

test('a mentee signing in from home or a direct link reaches My sessions', () => {
  assert.equal(getSignInDestination('s17', false), 's6');
  assert.equal(getSignInDestination('s12', false), 's6');
});

test('sign-in during booking resumes its summary only with a selected time', () => {
  assert.equal(getSignInDestination('s3', true), 's4');
  assert.equal(getSignInDestination('s3', false), 's6');
});

test('an abandoned booking does not redirect standalone sign-in to checkout', () => {
  assert.equal(getSignInDestination('s17', true), 's6');
  assert.equal(getSignInDestination('s1', true), 's6');
});

test('home section navigation focuses the heading without replacing the screen hash', t => {
  const dom = new JSDOM('<h2 id="how" tabindex="-1">How it works</h2>', { url: 'http://localhost/#s17' });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document });
  t.after(() => { dom.window.close(); if (previous) Object.defineProperty(globalThis, 'document', previous); else Reflect.deleteProperty(globalThis, 'document'); });
  const heading = dom.window.document.getElementById('how')!;
  let scrolled = false;
  heading.scrollIntoView = () => { scrolled = true; };
  scrollToSection('how');
  assert.equal(dom.window.document.activeElement, heading);
  assert.equal(scrolled, true);
  assert.equal(dom.window.location.hash, '#s17');
  assert.doesNotThrow(() => scrollToSection('not-on-this-page'));
});
