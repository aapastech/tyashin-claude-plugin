// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSpec, contrast, factsGuard } from '../mcp/spec-check.mjs';

const load = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const intake = load('example-intake.json');
const fresh = () => load('example-spec.json');

test('the worked example passes with no errors or warnings', () => {
  const r = checkSpec(fresh(), intake);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.summary.pages.length, 6);
});

test('schema: unknown section type, unknown field and bad enum are errors', () => {
  const s = fresh();
  s.pages[0].sections.push({ type: 'carousel', items: [] });
  s.brand.slogan = 'x';
  s.design.headingFont = 'comic-sans';
  const r = checkSpec(s, intake);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('unknown section type "carousel"')));
  assert.ok(r.errors.some((e) => e.includes('brand.slogan: unknown field')));
  assert.ok(r.errors.some((e) => e.startsWith('design.headingFont')));
});

test('facts guard: invented phone, email, URL, number and testimonial are refused', () => {
  const s = fresh();
  s.pages[0].sections[0].sub = 'Call 0117 496 9999 or write to sales@harbourandpine.example.';
  s.pages[2].sections[0].paragraphs.push('Trusted by 500+ clients since 1998. See https://instagram.com/harbourpine');
  s.pages[0].sections.splice(2, 0, {
    type: 'testimonials',
    items: [{ quote: 'They transformed our living room beyond words.', name: 'Sarah K.' }],
  });
  const r = checkSpec(s, intake);
  const facts = r.errors.filter((e) => e.startsWith('FACT NOT SUPPLIED'));
  assert.ok(facts.some((e) => e.includes('0117 496 9999')), facts.join('\n'));
  assert.ok(facts.some((e) => e.includes('sales@harbourandpine.example')));
  assert.ok(facts.some((e) => e.includes('https://instagram.com/harbourpine')));
  assert.ok(facts.some((e) => e.includes('500+')));
  assert.ok(facts.some((e) => e.includes('1998')));
  assert.ok(facts.some((e) => e.includes('Sarah K.')));
});

test('facts guard: the same facts pass once the owner confirmed them verbatim', () => {
  const s = fresh();
  s.pages[2].sections[0].paragraphs.push('Making furniture since 1998.');
  s.pages[0].sections.splice(2, 0, {
    type: 'testimonials',
    items: [{ quote: 'They made a crooked alcove look like it was built with the house.', name: 'J. Patel' }],
  });
  const confirmed = [
    'We have been making furniture since 1998',
    '"They made a crooked alcove look like it was built with the house." — J. Patel',
  ];
  const r = checkSpec(s, intake, confirmed);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('the business name is a fact; custom sections, extra heroes and dead links are errors', () => {
  const s = fresh();
  s.brand.name = 'Harbour and Pine';
  s.pages[1].sections.unshift({ type: 'hero', variant: 'centered', headline: 'Services' });
  s.pages[1].sections.push({ type: 'custom', name: 'Configurator', brief: 'x' });
  s.pages[0].sections[2].primaryCta.href = '/portfolio';
  s.footer.columns[0].links.push({ label: 'Blog', href: '#' });
  const r = checkSpec(s, intake);
  assert.ok(r.errors.some((e) => e.includes('must equal the business name')));
  assert.ok(r.errors.some((e) => e.includes('custom sections are not available')));
  assert.ok(r.errors.some((e) => e.includes('only the home page has a hero')));
  assert.ok(r.errors.some((e) => e.includes('"/portfolio" goes nowhere')));
  assert.ok(r.errors.some((e) => e.includes('link "#" goes nowhere')));
});

test('required pages and nav cap', () => {
  const s = fresh();
  s.pages = s.pages.filter((p) => p.path !== '/terms');
  const r = checkSpec(s, intake);
  assert.ok(r.errors.includes('pages: "/terms" is required'));
});

test('contrast below WCAG AA is an error; pure black ink a warning', () => {
  assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 0.01);
  const s = fresh();
  s.design.palette.onPrimary = '#3a5a48';
  s.design.palette.ink = '#000000';
  const r = checkSpec(s, intake);
  assert.ok(r.errors.some((e) => e.startsWith('contrast onPrimary on primary')));
  assert.ok(r.warnings.some((w) => w.includes('pure black')));
});

test('craft warnings: long headline, cliché, missing closing CTA', () => {
  const s = fresh();
  s.pages[0].sections[0].headline = 'Welcome to our website where we build the very best joinery around';
  s.pages[2].sections.pop();
  const r = checkSpec(s, intake);
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some((w) => w.includes('words (≤ 9)')));
  assert.ok(r.warnings.some((w) => w.includes('cliché "welcome to our website"')));
  assert.ok(r.warnings.some((w) => w.includes('/about: end the page with a "cta"')));
});

test('leads: the /contact page needs a contact section with form: true', () => {
  const s = fresh();
  const contact = s.pages.find((p) => p.path === '/contact');
  const section = contact.sections.find((x) => x.type === 'contact');
  delete section.form;
  let r = checkSpec(s, intake);
  assert.ok(r.errors.some((e) => e.includes('set "form": true')));
  contact.sections = contact.sections.filter((x) => x.type !== 'contact');
  r = checkSpec(s, intake);
  assert.ok(r.errors.some((e) => e.includes('add a "contact" section with "form": true')));
});

test('humanizer: AI-sounding copy is refused with the platform rule ids; one mild hit is only a warning', () => {
  const s = fresh();
  s.pages[0].sections[0].sub = 'Nestled in the heart of Bristol, we deliver seamless joinery.';
  const r = checkSpec(s, intake);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith('AI-SOUNDING COPY') && e.includes('promotional')), r.errors.join('\n'));

  const mild = fresh();
  mild.pages[2].sections[0].paragraphs.push('We measure twice in order to cut once, and fit every piece ourselves so nothing is left to chance on the day.');
  const r2 = checkSpec(mild, intake);
  assert.equal(r2.ok, true, r2.errors.join('\n'));
  assert.ok(r2.warnings.some((w) => w.includes('filler')));
});

test('facts guard: years in law names and code values are not invented facts; real ones still are', () => {
  const ok = factsGuard(
    [
      ['privacy', 'Under the Information Technology Rules, 2021 and the Digital Personal Data Protection Act, 2023.'],
      ['privacy', 'The IT Act 2000, the Consumer Protection Regulations 2020 and the Civil Procedure Code, 1908 apply.'],
      ['code', 'aap_region=in; path=/; max-age=31536000; SameSite=Lax'],
    ],
    intake
  );
  assert.deepEqual(ok.errors, []);
  const bad = factsGuard(
    [
      ['home', 'Serving Bristol since 2009. Call 01174969999 or +44 117 496 9999.'],
      ['home', 'Act now: kitchens from £4,950.'],
    ],
    intake
  );
  for (const s of ['"2009"', '01174969999', '+44 117 496 9999', '£4,950'])
    assert.ok(bad.errors.some((e) => e.includes(s)), `missing: ${s}\n${bad.errors.join('\n')}`);
});
