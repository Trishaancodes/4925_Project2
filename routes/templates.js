const express = require('express');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Anyone can view. Only the owner can edit or delete (anyone else gets a 400).

// All templates
router.get('/', (req, res) => {
  res.send('TODO: list all templates');
});

// Form to build a new template (name + columns)
// Must come before /:templateId so "new" isn't treated as an id
router.get('/new', requireLogin, (req, res) => {
  res.send('TODO: new template form');
});

// Save a new template and its version 1 fields
router.post('/', requireLogin, (req, res) => {
  res.send('TODO: create template');
});

// One template and its columns
router.get('/:templateId', (req, res) => {
  res.send(`TODO: show template ${req.params.templateId}`);
});

router.get('/:templateId/edit', requireLogin, (req, res) => {
  res.send(`TODO: edit form for template ${req.params.templateId}`);
});

// Save changes (new version if a list already uses the current one)
router.post('/:templateId/edit', requireLogin, (req, res) => {
  res.send(`TODO: update template ${req.params.templateId}`);
});

router.post('/:templateId/delete', requireLogin, (req, res) => {
  res.send(`TODO: delete template ${req.params.templateId}`);
});

module.exports = router;
