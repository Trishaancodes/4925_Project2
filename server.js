require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { MongoStore, createWebCryptoAdapter } = require('connect-mongo');

const { exposeUser } = require('./middleware/auth');
const { STARTER_USERNAME } = require('./lib/starter');
const authRoutes = require('./routes/auth');
const templateRoutes = require('./routes/templates');
const listRoutes = require('./routes/lists');
const entryRoutes = require('./routes/entries');
const accountRoutes = require('./routes/account');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// On the live site, refuse to start without real secrets instead of silently using weak defaults
if (isProduction) {
  const missing = ['SESSION_SECRET', 'MONGO_URL', 'MONGO_CRYPTO_SECRET', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
    .filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.locals.starterUsername = STARTER_USERNAME; // views label the built-in starter templates
// Dates are stored in UTC; show them in the app's time zone (Vancouver unless TZ_DISPLAY says otherwise)
const DISPLAY_TIME_ZONE = process.env.TZ_DISPLAY || 'America/Vancouver';
app.locals.formatDate = (date) => date.toLocaleDateString('en-US', {
  timeZone: DISPLAY_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric',
});
app.locals.formatDateTime = (date) => date.toLocaleString('en-US', {
  timeZone: DISPLAY_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
// Bootstrap Icons class for each column type
app.locals.fieldIcons = {
  boolean: 'bi-check2-square', text: 'bi-fonts', textarea: 'bi-text-paragraph', dropdown: 'bi-menu-button-wide',
  date: 'bi-calendar-event', number: 'bi-123', email: 'bi-envelope', url: 'bi-link-45deg',
};

// Render (and most hosts) sit behind a proxy; needed for secure cookies
if (isProduction) app.set('trust proxy', 1);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions live in MongoDB, encrypted. Without MONGO_URL (local dev) they fall back to memory.
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60, // 1 hour
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
  },
  store: process.env.MONGO_URL
    ? MongoStore.create({
        mongoUrl: process.env.MONGO_URL,
        dbName: process.env.MONGO_DB_NAME || 'list_templates',
        cryptoAdapter: createWebCryptoAdapter({ secret: process.env.MONGO_CRYPTO_SECRET }),
      })
    : undefined,
}));

app.use(exposeUser);

// Logged-in users land on their dashboard; everyone else sees the welcome page
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('index');
});

app.use('/', authRoutes);
app.use('/', accountRoutes);
app.use('/templates', templateRoutes);
app.use('/lists', listRoutes);
app.use('/lists/:listId/entries', entryRoutes);

app.use((req, res) => {
  res.status(404).render('error', { title: 'Page not found', message: "That page doesn't exist." });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
