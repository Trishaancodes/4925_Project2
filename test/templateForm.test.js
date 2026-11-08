// Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTemplateForm } = require('../lib/templateForm');

const form = (name, fields) => parseTemplateForm({ name, fields });

test('valid template is cleaned up', () => {
  const { errors, template } = form('  Survey Response ', [
    { name: ' completed ', type: 'boolean', required: 'on' },
    { name: 'response', type: 'dropdown', required: 'on', options: 'yes, no, maybe, yes,,' },
    { name: 'comments', type: 'textarea' },
  ]);
  assert.deepEqual(errors, []);
  assert.equal(template.name, 'Survey Response');
  assert.deepEqual(template.fields.map((f) => [f.name, f.type, f.isRequired, f.rules]), [
    ['completed', 'boolean', true, null],
    ['response', 'dropdown', true, { options: ['yes', 'no', 'maybe'] }],
    ['comments', 'textarea', false, null],
  ]);
});

test('needs a name and at least one column', () => {
  assert.deepEqual(form('', []).errors, ['Give the template a name.', 'Add at least one column.']);
});

test('column names must be filled in and unique (ignoring case)', () => {
  const { errors } = form('T', [
    { name: 'Email', type: 'text' },
    { name: 'email', type: 'text' },
    { name: '', type: 'text' },
  ]);
  assert.deepEqual(errors, ['Column 2: there is already a column called "email".', 'Column 3: give it a name.']);
});

test('type must be one of the known types', () => {
  assert.deepEqual(form('T', [{ name: 'x', type: 'colour' }]).errors, ['Column 1: pick a valid type.']);
});

test('dropdown needs at least one option', () => {
  assert.deepEqual(form('T', [{ name: 'x', type: 'dropdown', options: ' , ' }]).errors, [
    'Column 1: a dropdown needs at least one option.',
  ]);
});

test('number min/max are optional, must be numbers and in order', () => {
  assert.equal(form('T', [{ name: 'n', type: 'number' }]).template.fields[0].rules, null);
  assert.deepEqual(form('T', [{ name: 'n', type: 'number', min: '1', max: '5' }]).template.fields[0].rules, { min: 1, max: 5 });
  assert.deepEqual(form('T', [{ name: 'n', type: 'number', min: 'a' }]).errors, ['Column 1: minimum must be a number.']);
  assert.deepEqual(form('T', [{ name: 'n', type: 'number', min: '9', max: '1' }]).errors, [
    "Column 1: minimum can't be bigger than maximum.",
  ]);
});

test('rows sent as an object (many columns) keep their order', () => {
  const fields = {};
  for (let i = 0; i < 25; i++) fields[i] = { name: `c${i}`, type: 'text' };
  const { errors, template } = form('Big', fields);
  assert.deepEqual(errors, []);
  assert.deepEqual(template.fields.map((f) => f.name), Object.values(fields).map((f) => f.name));
});

test('at most 50 columns', () => {
  const fields = Array.from({ length: 51 }, (_, i) => ({ name: `c${i}`, type: 'text' }));
  assert.deepEqual(form('T', fields).errors, ['A template can have at most 50 columns.']);
});
