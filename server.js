require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoStore, createWebCryptoAdapter } = require('connect-mongo');

const authRoutes = require('./routes/auth');
const templateRoutes = require('./routes/templates');
const listRoutes = require('./routes/lists');
const entryRoutes = require('./routes/entries');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions live in MongoDB, encrypted. Without MONGO_URL (local dev) they fall back to memory.
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 }, // 1 hour
  store: process.env.MONGO_URL
    ? MongoStore.create({
        mongoUrl: process.env.MONGO_URL,
        cryptoAdapter: createWebCryptoAdapter({ secret: process.env.MONGO_CRYPTO_SECRET }),
      })
    : undefined,
}));

app.get('/', (req, res) => {
  res.send('TODO: home page');
});

app.use('/', authRoutes);
app.use('/templates', templateRoutes);
app.use('/lists', listRoutes);
app.use('/lists/:listId/entries', entryRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
