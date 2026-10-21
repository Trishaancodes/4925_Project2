const express = require('express');
const { requireLogin } = require('../middleware/auth');

// mergeParams lets us read :listId from the parent path /lists/:listId/entries
const router = express.Router({ mergeParams: true });

// Every save must be validated server-side against the list's template version fields.

// Form with one input per column
router.get('/new', requireLogin, (req, res) => {
  res.send(`TODO: new entry form for list ${req.params.listId}`);
});

router.post('/', requireLogin, (req, res) => {
  res.send(`TODO: validate and add entry to list ${req.params.listId}`);
});

router.get('/:entryId/edit', requireLogin, (req, res) => {
  res.send(`TODO: edit form for entry ${req.params.entryId}`);
});

router.post('/:entryId/edit', requireLogin, (req, res) => {
  res.send(`TODO: validate and update entry ${req.params.entryId}`);
});

router.post('/:entryId/delete', requireLogin, (req, res) => {
  res.send(`TODO: delete entry ${req.params.entryId}`);
});

module.exports = router;
