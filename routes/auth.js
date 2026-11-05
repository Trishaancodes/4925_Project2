const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const router = express.Router();

const SALT_ROUNDS = 12;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Returns a list of problems with the password (empty list = valid)
function checkPassword(password) {
  const problems = [];
  if (password.length < 10) problems.push('Password must be at least 10 characters.');
  if (!/[A-Z]/.test(password)) problems.push('Password needs an uppercase letter.');
  if (!/[a-z]/.test(password)) problems.push('Password needs a lowercase letter.');
  if (!/[0-9]/.test(password)) problems.push('Password needs a number.');
  if (!/[^A-Za-z0-9]/.test(password)) problems.push('Password needs a symbol.');
  return problems;
}

// Only allow redirects back to our own pages (not "//evil.com")
function safeReturnTo(url) {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

// Starts a fresh session for the user (new session id stops session fixation)
function logIn(req, user, callback) {
  const returnTo = safeReturnTo(req.session.returnTo);
  req.session.regenerate((err) => {
    if (err) return callback(err);
    req.session.userId = user.user_id;
    req.session.username = user.username;
    callback(null, returnTo);
  });
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session.userId) return res.redirect('/');
  next();
}

router.get('/signup', redirectIfLoggedIn, (req, res) => {
  res.render('signup', { errors: [], values: {} });
});

router.post('/signup', redirectIfLoggedIn, async (req, res, next) => {
  const username = (req.body.username || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const confirmPassword = req.body.confirmPassword || '';

  const errors = [];
  if (!USERNAME_PATTERN.test(username)) {
    errors.push('Username must be 3 to 50 characters: letters, numbers and underscores only.');
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 255) {
    errors.push('Enter a valid email address.');
  }
  errors.push(...checkPassword(password));
  if (password !== confirmPassword) {
    errors.push('Passwords do not match.');
  }

  if (errors.length) {
    return res.status(400).render('signup', { errors, values: { username, email } });
  }

  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const [result] = await db.query(
      'INSERT INTO `user` (username, email, password_hash) VALUES (?, ?, ?)',
      [username, email, passwordHash]
    );

    logIn(req, { user_id: result.insertId, username }, (err, returnTo) => {
      if (err) return next(err);
      res.redirect(returnTo);
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).render('signup', {
        errors: ['That username or email is already taken.'],
        values: { username, email },
      });
    }
    next(err);
  }
});

router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('login', { errors: [], values: {} });
});

router.post('/login', redirectIfLoggedIn, async (req, res, next) => {
  const identifier = (req.body.identifier || '').trim();
  const password = req.body.password || '';

  try {
    const [rows] = await db.query(
      'SELECT user_id, username, password_hash FROM `user` WHERE username = ? OR email = ?',
      [identifier, identifier.toLowerCase()]
    );
    const user = rows[0];

    // Same message whether the user doesn't exist or the password is wrong
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(400).render('login', {
        errors: ['Incorrect username/email or password.'],
        values: { identifier },
      });
    }

    logIn(req, user, (err, returnTo) => {
      if (err) return next(err);
      res.redirect(returnTo);
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;
