// The logged-in user's own pages: dashboard, all their entries, and account settings
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { SALT_ROUNDS, checkPassword } = require('../lib/password');
const router = express.Router();

const ENTRIES_PER_PAGE = 20;

// SQL for "this entry's list now follows a newer template version than the entry was saved under"
const ENTRY_IS_OUTDATED = `e.version_id <> (
  SELECT v.version_id FROM \`template_version\` v WHERE v.template_id = l.template_id
  ORDER BY v.version_number DESC LIMIT 1
)`;

// "email: a@b.com · date: 2026-11-22 · …" for showing an entry in one line
function entryPreview(data, maxParts = 3) {
  const parts = Object.entries(data)
    .slice(0, maxParts)
    .map(([key, value]) => `${key}: ${typeof value === 'boolean' ? (value ? 'yes' : 'no') : value}`);
  if (Object.keys(data).length > maxParts) parts.push('…');
  return parts.join(' · ');
}

router.get('/dashboard', requireLogin, async (req, res, next) => {
  const userId = req.session.userId;
  try {
    const [[counts]] = await db.query(`
      SELECT (SELECT COUNT(*) FROM \`template\` WHERE user_id = ?) AS templates,
             (SELECT COUNT(*) FROM \`list\` WHERE user_id = ?) AS lists,
             (SELECT COUNT(*) FROM \`list_entry\` e JOIN \`list\` l ON l.list_id = e.list_id WHERE l.user_id = ?) AS entries,
             (SELECT COUNT(*) FROM \`list_entry\` e JOIN \`list\` l ON l.list_id = e.list_id
               WHERE l.user_id = ? AND ${ENTRY_IS_OUTDATED}) AS outdated
    `, [userId, userId, userId, userId]);

    const [recentLists] = await db.query(`
      SELECT l.list_id, l.name, t.name AS template_name,
             (SELECT COUNT(*) FROM \`list_entry\` e WHERE e.list_id = l.list_id) AS entry_count,
             (SELECT MAX(e.updated_at) FROM \`list_entry\` e WHERE e.list_id = l.list_id) AS last_entry_at
      FROM \`list\` l
      JOIN \`template\` t ON t.template_id = l.template_id
      WHERE l.user_id = ?
      ORDER BY COALESCE((SELECT MAX(e.updated_at) FROM \`list_entry\` e WHERE e.list_id = l.list_id), l.created_at) DESC
      LIMIT 5
    `, [userId]);

    const [recentEntries] = await db.query(`
      SELECT e.entry_id, e.data, e.updated_at, l.list_id, l.name AS list_name
      FROM \`list_entry\` e
      JOIN \`list\` l ON l.list_id = e.list_id
      WHERE l.user_id = ?
      ORDER BY e.updated_at DESC, e.entry_id DESC
      LIMIT 5
    `, [userId]);

    res.render('dashboard', {
      counts,
      recentLists,
      recentEntries: recentEntries.map((e) => ({ ...e, preview: entryPreview(e.data) })),
    });
  } catch (err) {
    next(err);
  }
});

// Every entry in the user's lists, newest first, with search and an optional list filter
router.get('/entries', requireLogin, async (req, res, next) => {
  const userId = req.session.userId;
  const q = String(req.query.q || '').trim();
  const listId = /^\d+$/.test(String(req.query.list || '')) ? Number(req.query.list) : null;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  try {
    const where = ['l.user_id = ?'];
    const params = [userId];
    if (listId) {
      where.push('l.list_id = ?');
      params.push(listId);
    }
    if (q) {
      // Search inside the entry's values and the list name
      where.push('(CAST(e.data AS CHAR) LIKE ? OR l.name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    const whereSql = where.join(' AND ');

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM \`list_entry\` e JOIN \`list\` l ON l.list_id = e.list_id WHERE ${whereSql}`,
      params
    );
    const pages = Math.max(1, Math.ceil(total / ENTRIES_PER_PAGE));
    const currentPage = Math.min(page, pages);

    const [entries] = await db.query(`
      SELECT e.entry_id, e.data, e.updated_at, l.list_id, l.name AS list_name, v.version_number,
             ${ENTRY_IS_OUTDATED} AS outdated
      FROM \`list_entry\` e
      JOIN \`list\` l ON l.list_id = e.list_id
      JOIN \`template_version\` v ON v.version_id = e.version_id
      WHERE ${whereSql}
      ORDER BY e.updated_at DESC, e.entry_id DESC
      LIMIT ? OFFSET ?
    `, [...params, ENTRIES_PER_PAGE, (currentPage - 1) * ENTRIES_PER_PAGE]);

    const [lists] = await db.query('SELECT list_id, name FROM `list` WHERE user_id = ? ORDER BY name', [userId]);

    res.render('entries/index', {
      entries: entries.map((e) => ({ ...e, preview: entryPreview(e.data, 4) })),
      lists,
      filters: { q, listId },
      pagination: { page: currentPage, pages, total, perPage: ENTRIES_PER_PAGE },
    });
  } catch (err) {
    next(err);
  }
});

async function renderSettings(req, res, status, { errors = [], saved = false } = {}) {
  const [[account]] = await db.query(
    'SELECT username, email, created_at FROM `user` WHERE user_id = ?',
    [req.session.userId]
  );
  res.status(status).render('settings', { account, errors, saved });
}

router.get('/settings', requireLogin, async (req, res, next) => {
  try {
    await renderSettings(req, res, 200, { saved: req.query.saved === '1' });
  } catch (err) {
    next(err);
  }
});

router.post('/settings/password', requireLogin, async (req, res, next) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';
  const confirmPassword = req.body.confirmPassword || '';

  try {
    const [[user]] = await db.query('SELECT password_hash FROM `user` WHERE user_id = ?', [req.session.userId]);
    const errors = [];
    if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
      errors.push('Your current password is incorrect.');
    }
    errors.push(...checkPassword(newPassword));
    if (newPassword !== confirmPassword) errors.push('New passwords do not match.');

    if (errors.length) return await renderSettings(req, res, 400, { errors });

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await db.query('UPDATE `user` SET password_hash = ? WHERE user_id = ?', [passwordHash, req.session.userId]);
    res.redirect('/settings?saved=1');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
