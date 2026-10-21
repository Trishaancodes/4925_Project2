const express = require('express');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

// Anyone can view. Only the owner can change a list or its entries (anyone else gets a 400).

// All lists
router.get('/', (req, res) => {
  res.send('TODO: list all lists');
});

// Form: list name + pick a template
router.get('/new', requireLogin, (req, res) => {
  res.send('TODO: new list form');
});

// Save a new list, tied to the template's current version
router.post('/', requireLogin, (req, res) => {
  res.send('TODO: create list');
});

// One list as a table: its columns and all its entries
router.get('/:listId', (req, res) => {
  res.send(`TODO: show list ${req.params.listId}`);
});

router.post('/:listId/delete', requireLogin, (req, res) => {
  res.send(`TODO: delete list ${req.params.listId}`);
});

module.exports = router;
