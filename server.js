require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const { MongoStore, createWebCryptoAdapter } = require('connect-mongo');

const { exposeUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const templateRoutes = require('./routes/templates');
const listRoutes = require('./routes/lists');
const entryRoutes = require('./routes/entries');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Render (and most hosts) sit behind a proxy; needed for secure cookies
if (isProduction) app.set('trust proxy', 1);

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
        cryptoAdapter: createWebCryptoAdapter({ secret: process.env.MONGO_CRYPTO_SECRET }),
      })
    : undefined,
}));

app.use(exposeUser);

app.get('/', (req, res) => {
  res.render('index');
});

app.use('/', authRoutes);
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
