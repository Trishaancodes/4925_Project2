// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEntry, isValidDate, MAX_TEXT_LENGTH } = require('../lib/validate');

// Helper: validate an object of { columnName: rawValue } against fields
const check = (fields, input) => validateEntry(fields, (f) => input[f.name]);
const messages = (result) => result.errors.map((e) => e.message);

const contact = [
  { name: 'email', type: 'text', is_required: 1, rules: null },
  { name: 'appointment_date', type: 'date', is_required: 1, rules: null },
];

const survey = [
  { name: 'completed', type: 'boolean', is_required: 1, rules: null },
  { name: 'response', type: 'dropdown', is_required: 1, rules: { options: ['yes', 'no', 'maybe'] } },
  { name: 'comments', type: 'textarea', is_required: 0, rules: null },
];

test('valid contact entry is accepted and cleaned', () => {
  const result = check(contact, { email: '  alfred@example.com ', appointment_date: '2026-11-22' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data, { email: 'alfred@example.com', appointment_date: '2026-11-22' });
});

test('required fields cannot be missing or blank', () => {
  const result = check(contact, { email: '   ' });
  assert.deepEqual(messages(result), ['email is required', 'appointment_date is required']);
  assert.deepEqual(result.data, {});
});

test('optional blank fields are left out of the data', () => {
  const result = check(survey, { completed: 'false', response: 'maybe', comments: '' });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.data, { completed: false, response: 'maybe' });
});

test('dropdown only accepts its listed options', () => {
  const result = check(survey, { completed: 'on', response: 'busy' });
  assert.deepEqual(messages(result), ['response must be one of: yes, no, maybe']);
});

test('dropdown is case-sensitive and exact', () => {
  assert.equal(check(survey, { completed: 'on', response: 'Yes' }).errors.length, 1);
});

test('checkbox: checked, unchecked (hidden "false") and junk', () => {
  // Checked boxes send both the hidden "false" and "on"; the last one wins
  assert.equal(check(survey, { completed: ['false', 'on'], response: 'no' }).data.completed, true);
  assert.equal(check(survey, { completed: 'false', response: 'no' }).data.completed, false);
  assert.deepEqual(messages(check(survey, { completed: 'maybe', response: 'no' })), ['completed must be yes or no']);
});

test('required checkbox must be sent', () => {
  assert.deepEqual(messages(check(survey, { response: 'no' })), ['completed is required']);
});

test('dates must be real calendar dates', () => {
  assert.equal(isValidDate('2026-11-22'), true);
  assert.equal(isValidDate('2028-02-29'), true); // leap year
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('Nov 22, 2026'), false);
  assert.equal(isValidDate('2026-1-5'), false);
});

test('text has a length limit', () => {
  const long = 'a'.repeat(MAX_TEXT_LENGTH + 1);
  assert.deepEqual(messages(check(contact, { email: long, appointment_date: '2026-11-22' })), [
    `email must be ${MAX_TEXT_LENGTH} characters or less`,
  ]);
});

test('textarea keeps line breaks and inner spacing', () => {
  const result = check(survey, { completed: 'on', response: 'yes', comments: 'line one\r\n  line two  \n' });
  assert.equal(result.data.comments, 'line one\n  line two');
});

test('unknown extra input is ignored', () => {
  const fields = [{ name: 'email', type: 'text', is_required: 0, rules: null }];
  const result = validateEntry(fields, () => 'a@b.com');
  assert.deepEqual(Object.keys(result.data), ['email']);
});

test('email must look like an email (PDF example: "email - required email")', () => {
  const fields = [{ name: 'email', type: 'email', is_required: 1, rules: null }];
  assert.deepEqual(check(fields, { email: ' AlfredJazz@example.com ' }).data, { email: 'AlfredJazz@example.com' });
  for (const bad of ['abc', 'a@b', '@example.com', 'a b@example.com']) {
    assert.deepEqual(messages(check(fields, { email: bad })), ['email must be a valid email address'], bad);
  }
});

test('number is stored as a number and respects min/max', () => {
  const fields = [{ name: 'rating', type: 'number', is_required: 1, rules: { min: 1, max: 5 } }];
  assert.deepEqual(check(fields, { rating: '4' }).data, { rating: 4 });
  assert.deepEqual(check(fields, { rating: '2.5' }).data, { rating: 2.5 });
  assert.deepEqual(messages(check(fields, { rating: '0' })), ['rating must be at least 1']);
  assert.deepEqual(messages(check(fields, { rating: '6' })), ['rating must be at most 5']);
  assert.deepEqual(messages(check(fields, { rating: 'four' })), ['rating must be a number']);
  assert.deepEqual(messages(check(fields, { rating: '1e3' })), ['rating must be a number']);
});

test('number without limits accepts negatives', () => {
  const fields = [{ name: 'balance', type: 'number', is_required: 0, rules: null }];
  assert.deepEqual(check(fields, { balance: '-12.75' }).data, { balance: -12.75 });
});

test('url only accepts http and https links', () => {
  const fields = [{ name: 'site', type: 'url', is_required: 0, rules: null }];
  assert.deepEqual(check(fields, { site: 'https://bcit.ca' }).data, { site: 'https://bcit.ca/' });
  for (const bad of ['bcit.ca', 'javascript:alert(1)', 'ftp://files.example.com']) {
    assert.equal(check(fields, { site: bad }).errors.length, 1, bad);
  }
});

test('unknown column type is reported, not saved', () => {
  const fields = [{ name: 'x', type: 'colour', is_required: 0, rules: null }];
  assert.deepEqual(messages(validateEntry(fields, () => 'red')), ['x has an unknown type']);
});
