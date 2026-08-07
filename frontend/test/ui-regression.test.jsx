/**
 * Regression tests for the two bugs reported from the deployed portals:
 *   1. Panel body had no padding, so text sat flush against the card edge.
 *   2. Typing inside a Modal stole focus back to the header's ✕ button.
 */
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true
});
for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'Element',
                   'Node', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
                   'MutationObserver', 'KeyboardEvent', 'Event', 'FocusEvent']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { default: Panel } = await import('../src/components/ui/Panel.jsx');
const { default: Modal } = await import('../src/components/ui/Modal.jsx');
const { TextField, TextAreaField } = await import('../src/components/ui/FormControls.jsx');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

let failures = 0;
const check = (name, condition, detail = '') => {
  if (condition) console.log(`  PASS  ${name}`);
  else { failures += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

// ── 1. Panel padding ─────────────────────────────────────────────────
console.log('\nPanel body padding');

const bodyClassOf = (markup) => {
  const d = new JSDOM(markup);
  const panel = d.window.document.querySelector('.panel');
  const header = panel.querySelector('.panel-header');
  const body = header ? header.nextElementSibling : panel.firstElementChild;
  return body.getAttribute('class') ?? '';
};

check(
  'omitting bodyClassName gives the standard p-5',
  bodyClassOf(renderToStaticMarkup(<Panel tab="Identity" tabIcon="badge"><p>Dr. Alice Smith</p></Panel>)) === 'p-5',
  `got "${bodyClassOf(renderToStaticMarkup(<Panel tab="Identity"><p>x</p></Panel>))}"`
);
check(
  'no tab, no bodyClassName still gets p-5',
  bodyClassOf(renderToStaticMarkup(<Panel><p>x</p></Panel>)) === 'p-5'
);
check(
  'explicit bodyClassName="" still means edge-to-edge (tables/lists)',
  bodyClassOf(renderToStaticMarkup(<Panel tab="Rows" bodyClassName=""><table /></Panel>)) === ''
);
check(
  'an explicit override is honoured',
  bodyClassOf(renderToStaticMarkup(<Panel tab="X" bodyClassName="p-0 pt-2"><p>x</p></Panel>)) === 'p-0 pt-2'
);

// ── 2. Modal focus ───────────────────────────────────────────────────
console.log('\nModal focus behaviour while typing');

const container = dom.window.document.getElementById('root');
const root = createRoot(container);

function AchievementDialog() {
  // An inline arrow, exactly as every caller writes it — this identity
  // changing on each render is what used to re-run the focus effect.
  const [title, setTitle] = React.useState('');
  const [note, setNote] = React.useState('');
  return (
    <Modal open onClose={() => {}} title="Add an achievement">
      <TextField name="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextAreaField name="note" label="What should the HOD know?" value={note} onChange={(e) => setNote(e.target.value)} />
    </Modal>
  );
}

await act(async () => { root.render(<AchievementDialog />); });
await act(async () => { await new Promise((r) => setTimeout(r, 60)); });

const doc = dom.window.document;
const titleInput = doc.querySelector('input[name="title"]');
const closeButton = doc.querySelector('button[aria-label="Close"]');

check('the first form field receives focus on open, not the ✕',
  doc.activeElement === titleInput,
  `focus was on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);

// Type three characters, re-rendering between each one.
for (const char of ['f', 'd', 's']) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    setter.call(titleInput, titleInput.value + char);
    titleInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 45)); });
}

check('focus stays in the input after typing (did not jump to ✕)',
  doc.activeElement === titleInput,
  `focus ended on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);
check('the typed characters actually landed', titleInput.value === 'fds', `value was "${titleInput.value}"`);
check('the ✕ button is not focused', doc.activeElement !== closeButton);

// Same check for the textarea used by "Report to HOD".
const textarea = doc.querySelector('textarea[name="note"]');
await act(async () => { textarea.focus(); });
for (const char of ['n', 'o']) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, textarea.value + char);
    textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 45)); });
}
check('focus stays in the Report-to-HOD textarea while typing',
  doc.activeElement === textarea,
  `focus ended on ${doc.activeElement?.getAttribute('aria-label') ?? doc.activeElement?.tagName}`);
check('the textarea kept its text', textarea.value === 'no', `value was "${textarea.value}"`);

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
