// Ready-made templates everyone can use. They belong to a built-in account that nobody can
// log in to, so they can be copied or used for lists but never edited. Created by db/seed.js.

const STARTER_USERNAME = 'starter_templates';

const STARTER_TEMPLATES = [
  {
    name: 'Contact',
    fields: [
      { name: 'name', type: 'text', isRequired: true },
      { name: 'email', type: 'email', isRequired: true },
      { name: 'phone', type: 'text', isRequired: false },
      { name: 'appointment_date', type: 'date', isRequired: false },
    ],
  },
  {
    name: 'Survey Response',
    fields: [
      { name: 'completed', type: 'boolean', isRequired: true },
      { name: 'response', type: 'dropdown', isRequired: true, rules: { options: ['yes', 'no', 'maybe'] } },
      { name: 'comments', type: 'textarea', isRequired: false },
    ],
  },
  {
    name: 'To-Do',
    fields: [
      { name: 'task', type: 'text', isRequired: true },
      { name: 'priority', type: 'dropdown', isRequired: true, rules: { options: ['low', 'medium', 'high'] } },
      { name: 'due', type: 'date', isRequired: false },
      { name: 'done', type: 'boolean', isRequired: true },
    ],
  },
  {
    name: 'Reading List',
    fields: [
      { name: 'title', type: 'text', isRequired: true },
      { name: 'author', type: 'text', isRequired: false },
      { name: 'link', type: 'url', isRequired: false },
      { name: 'rating', type: 'number', isRequired: false, rules: { min: 1, max: 5 } },
      { name: 'notes', type: 'textarea', isRequired: false },
    ],
  },
  {
    name: 'Event RSVP',
    fields: [
      { name: 'guest', type: 'text', isRequired: true },
      { name: 'email', type: 'email', isRequired: true },
      { name: 'attending', type: 'dropdown', isRequired: true, rules: { options: ['yes', 'no', 'maybe'] } },
      { name: 'guests_bringing', type: 'number', isRequired: false, rules: { min: 0, max: 10 } },
      { name: 'dietary_needs', type: 'text', isRequired: false },
    ],
  },
];

module.exports = { STARTER_USERNAME, STARTER_TEMPLATES };
