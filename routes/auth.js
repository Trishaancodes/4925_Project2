const express = require('express');
const router = express.Router();

// Show the sign-up form
router.get('/signup', (req, res) => {
  res.send('TODO: sign-up form');
});

// Create an account (hash the password, check it is 10+ chars with upper/lower/number/symbol)
router.post('/signup', (req, res) => {
  res.send('TODO: create user');
});

// Show the login form
router.get('/login', (req, res) => {
  res.send('TODO: login form');
});

// Check the password and start a session
router.post('/login', (req, res) => {
  res.send('TODO: log in');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
