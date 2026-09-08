import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('./prototype.js', import.meta.url), 'utf8');
const storageKey = 'om-prototype-comments:v2:journey-test';
const markup = `
  <div class="doc-toolbar">
    <nav class="screen-nav">
      <a href="#s1">One</a><a href="#s2">Two</a><a href="#not-a-screen">Other section</a>
    </nav>
    <button id="theme-toggle">Theme</button><button data-goto="s2">Toolbar next</button>
  </div>
  <section id="s1" class="screen">
    <div class="screen-meta"><h2>One</h2></div>
    <div class="frame">
      <h1>First screen</h1><button id="next" data-goto="s2">Next</button>
      <p id="comment-target">First target</p>
      <div id="keyboard-next" data-goto="s2">Keyboard next</div>
    </div>
  </section>
  <section id="s2" class="screen">
    <div class="screen-meta"><h2>Two</h2></div>
    <div class="frame">
      <h2>Second screen</h2><p id="reanchor-target">Second target</p>
      <button id="plain-button">Local action</button><a id="plain-link" href="#note">Local link</a>
      <label for="text-input">Email address</label><input id="text-input" value="Draft" />
      <textarea id="text-area" aria-label="Draft body">Draft text</textarea>
      <select id="select" aria-label="Time zone"><option>Europe/Warsaw</option></select>
      <div id="editable" contenteditable="true"><span id="editable-child">Draft content</span>
        <span contenteditable="false"><span id="non-editable-child">Read-only content</span></span>
      </div>
      <div id="plaintext" contenteditable="plaintext-only">Plain text</div>
      <div id="empty-editable" contenteditable>Editable text</div>
    </div>
  </section>
  <div id="not-a-screen">Non-screen</div>`;

function committedDocument() {
  return {
    version: 2, prototypeId: 'journey-test', operations: [{
      id: 'committed', threadId: 'thread-committed', type: 'create', at: '2026-09-07T00:00:00Z',
      payload: {
        screen: 's1', anchor: 'div:2>h1', label: 'Committed heading',
        message: { id: 'message-committed', author: 'Reviewer', at: '2026-09-07', text: 'Committed note' },
      },
    }],
  };
}

function environment(t, { hash = '#s2', stored = {}, prototypeId = 'journey-test' } = {}) {
  const dom = new JSDOM(`<!doctype html><html data-prototype-id="${prototypeId}"><body></body></html>`, {
    url: `http://localhost/${hash}`, runScripts: 'outside-only',
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  const d = w.document;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.confirm = () => true;
  // Each operation has a deterministic timestamp independent of machine speed.
  const RealDate = w.Date;
  let now = Date.UTC(2026, 8, 7, 12);
  w.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now++])); }
    static now() { return now++; }
  };
  w.Blob = Blob;
  const exports = [];
  w.URL.createObjectURL = blob => { exports.push(blob); return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  const click = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () {
    if (!this.href.startsWith('blob:')) click.call(this);
  };
  for (const [key, value] of Object.entries(stored)) w.localStorage.setItem(key, value);
  w.eval(source);
  const button = label => {
    const result = [...d.querySelectorAll('button')].find(item => item.textContent === label);
    assert.ok(result, `Expected button: ${label}`);
    return result;
  };
  return {
    w, d, exports, button,
    init() { d.body.innerHTML = markup; return w.__DEVMENTOR_PROTOTYPE_START__(); },
    navigate(id) { d.dispatchEvent(new w.CustomEvent('devmentor:navigate', { detail: id })); },
    key(target, key) {
      const event = new w.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    operations() { return JSON.parse(w.localStorage.getItem(storageKey)).operations; },
    snapshot() {
      return Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => w.localStorage.key(i))
        .map(key => [key, w.localStorage.getItem(key)]));
    },
  };
}

test('configured landing is the default and an existing screen link still wins', t => {
  const home = environment(t, { hash: '' });
  home.d.documentElement.setAttribute('data-start-screen', 's2');
  assert.equal(home.init(), true);
  assert.equal(home.w.location.hash, '#s2');
  const linked = environment(t, { hash: '#s1' });
  linked.d.documentElement.setAttribute('data-start-screen', 's2');
  linked.init();
  assert.equal(linked.w.location.hash, '#s1');
});

test('startup waits for React markup and remains idempotent after a valid hash opens', t => {
  const env = environment(t);
  const { w, d, button } = env;
  assert.equal(w.__DEVMENTOR_PROTOTYPE_START__(), false);
  const changes = [];
  d.addEventListener('devmentor:screen-change', event => changes.push(event.detail));
  assert.equal(env.init(), true);
  assert.equal(w.__DEVMENTOR_PROTOTYPE_START__(), true);
  for (const selector of ['.anno-panel', '.proto-toolbar', '.proto-back']) {
    assert.equal(d.querySelectorAll(selector).length, 1, selector);
  }
  assert.ok(d.body.classList.contains('proto-focus'));
  assert.equal(d.activeElement.textContent, 'Second screen');
  assert.equal(d.activeElement.tabIndex, -1);
  assert.equal(button('Presentation').getAttribute('aria-pressed'), 'true');
  assert.equal(d.querySelector('.proto-back').disabled, true);
  assert.deepEqual(changes, ['s2']);
  button('Show hotspots').click();
  assert.ok(d.body.classList.contains('proto-hints'));
  assert.equal(button('Hide hotspots').getAttribute('aria-pressed'), 'true');
});

test('toolbar links, hotspots and navigation events update the hash, focus and internal Back history', t => {
  const env = environment(t);
  const { d, w } = env;
  const changes = [];
  d.addEventListener('devmentor:screen-change', event => changes.push(event.detail));
  env.init();
  d.querySelector('.screen-nav a[href="#s1"]').click();
  assert.equal(w.location.hash, '#s1');
  assert.equal(d.activeElement.textContent, 'First screen');
  d.querySelector('.proto-back').click();
  assert.equal(w.location.hash, '#s2');
  assert.equal(d.querySelector('.proto-back').disabled, true);
  env.navigate('s1');
  env.button('Toolbar next').click();
  assert.equal(w.location.hash, '#s2');
  assert.equal(changes.length, 5);
  env.navigate('not-a-screen');
  env.navigate({ screen: 's1' });
  assert.equal(w.location.hash, '#s2');
  assert.equal(changes.length, 5);
  env.button('Presentation').click();
  env.navigate('s1');
  const keyboardTarget = d.querySelector('#keyboard-next');
  assert.equal(keyboardTarget.getAttribute('role'), 'button');
  assert.equal(keyboardTarget.tabIndex, 0);
  env.key(keyboardTarget, 'Enter');
  assert.equal(w.location.hash, '#s2');
  assert.equal(d.querySelector('.screen.is-current').id, 's2');
  d.querySelector('.proto-back').click();
  assert.equal(w.location.hash, '#s1');
});

test('Backspace returns from the programmatically focused heading and other non-editing elements', t => {
  const env = environment(t, { hash: '#s1' });
  const { d, w } = env;
  env.init();
  for (const target of ['heading', '#plain-button', '#plain-link', '#non-editable-child']) {
    env.navigate('s2');
    const node = target === 'heading' ? d.activeElement : d.querySelector(target);
    const event = env.key(node, 'Backspace');
    assert.equal(event.defaultPrevented, true, target);
    assert.equal(w.location.hash, '#s1', target);
    assert.equal(d.activeElement.textContent, 'First screen');
    assert.equal(d.querySelector('.proto-back').disabled, true);
  }
});

test('Backspace leaves editable controls and handled widget events alone', t => {
  const env = environment(t, { hash: '#s1' });
  const { d, w } = env;
  env.init();
  env.navigate('s2');
  for (const id of ['text-input', 'text-area', 'select', 'editable', 'editable-child', 'plaintext', 'empty-editable']) {
    const event = env.key(d.getElementById(id), 'Backspace');
    assert.equal(event.defaultPrevented, false, id);
    assert.equal(w.location.hash, '#s2', id);
    assert.equal(d.querySelector('.proto-back').disabled, false);
  }
  const widget = d.querySelector('#plain-button');
  widget.addEventListener('keydown', event => event.preventDefault(), { once: true });
  env.key(widget, 'Backspace');
  assert.equal(w.location.hash, '#s2');
  env.button('Presentation').click();
  assert.equal(env.key(d.activeElement, 'Backspace').defaultPrevented, false);
  assert.equal(w.location.hash, '#s2');
  env.button('Presentation').click();
  env.key(d.querySelector('#s2 .frame h2'), 'Backspace');
  assert.equal(w.location.hash, '#s1');
});

test('review mode isolates app actions and preserves the complete comment operation log and exports', async t => {
  const env = environment(t, { hash: '#s1' });
  const { d, w, button } = env;
  // Data loaded after the engine script is available when explicit startup runs.
  w.__OM_PROTOTYPE_COMMENTS__ = committedDocument();
  env.init();
  button('Comment').click();
  assert.equal(button('Comment').getAttribute('aria-pressed'), 'true');
  assert.equal(button('Clickable').getAttribute('aria-pressed'), 'false');
  assert.equal(d.querySelectorAll('[aria-selected]').length, 0);
  assert.equal(button('Comment').parentElement.getAttribute('role'), 'group');
  let appClicks = 0;
  d.querySelector('#next').addEventListener('click', () => { appClicks++; });
  d.querySelector('#next').click();
  assert.equal(appClicks, 0);
  assert.equal(w.location.hash, '#s1');
  assert.ok(d.querySelector('textarea[aria-label="New review comment"]'));
  button('Cancel').click();
  d.querySelector('#comment-target').click();
  const author = d.querySelector('.anno-panel-foot input');
  author.value = 'Local reviewer';
  author.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('.anno-panel textarea').value = 'New local note';
  button('Add comment').click();
  assert.equal(env.operations().filter(op => op.type === 'create').length, 1);
  assert.equal(w.__OM_PROTOTYPE_COMMENTS__.operations.length, 1);
  assert.ok(d.querySelector('textarea[aria-label="Reply to this review comment"]'));
  d.querySelector('.anno-panel textarea').value = 'Follow-up';
  button('Reply').click();
  button('Resolve').click();
  button('Reopen').click();
  button('Re-anchor').click();
  d.querySelector('.screen-nav a[href="#s2"]').click();
  assert.equal(w.location.hash, '#s2');
  d.querySelector('#reanchor-target').click();
  assert.equal(env.operations().find(op => op.type === 'reanchor').payload.screen, 's2');
  button('Delete').click();
  assert.deepEqual(env.operations().map(op => op.type), ['create', 'reply', 'set-resolved', 'set-resolved', 'reanchor', 'delete']);
  button('Export for repository').click();
  button('Export Markdown').click();
  const repository = await env.exports[0].text();
  assert.ok(repository.includes('"type": "delete"'));
  assert.ok(repository.includes('"id": "committed"'));
  const markdown = await env.exports[1].text();
  assert.ok(markdown.includes('Committed note'));
  assert.ok(!markdown.includes('New local note'));

  const reload = environment(t, { hash: '#bad-hash', stored: env.snapshot() });
  reload.w.__OM_PROTOTYPE_COMMENTS__ = committedDocument();
  reload.init();
  assert.equal(reload.w.location.hash, '#s1');
  assert.equal(reload.d.querySelectorAll('.anno-pin').length, 1);
  assert.equal(reload.operations().filter(op => op.type === 'delete').length, 1);
  const isolated = environment(t, { hash: '#%broken', stored: env.snapshot(), prototypeId: 'other-prototype' });
  isolated.w.__OM_PROTOTYPE_COMMENTS__ = committedDocument();
  isolated.init();
  assert.equal(isolated.w.location.hash, '#s1');
  assert.equal(isolated.d.querySelectorAll('.anno-pin').length, 0);
});

test('comment anchors use the associated native input label', t => {
  const env = environment(t);
  env.init();
  env.button('Comment').click();
  env.d.querySelector('#text-input').click();
  assert.equal(env.d.querySelector('.anno-thread.active .anno-anchor').textContent, 'Email address');
});


test('changing a live screen link uses navigation events without losing review state', t => {
  const env = environment(t);
  env.init();
  const changes = [];
  env.d.addEventListener('devmentor:screen-change', event => changes.push(event.detail));
  const before = env.snapshot();
  env.w.history.replaceState(null, '', '#s1');
  env.w.dispatchEvent(new env.w.HashChangeEvent('hashchange'));
  assert.equal(env.d.querySelector('.screen.is-current').id, 's1');
  assert.equal(env.d.activeElement.textContent, 'First screen');
  assert.deepEqual(changes, ['s1']);
  env.w.dispatchEvent(new env.w.HashChangeEvent('hashchange'));
  assert.deepEqual(changes, ['s1']);
  env.w.history.replaceState(null, '', '#missing');
  env.w.dispatchEvent(new env.w.HashChangeEvent('hashchange'));
  assert.equal(env.d.querySelector('.screen.is-current').id, 's1');
  assert.deepEqual(env.snapshot(), before);
});
