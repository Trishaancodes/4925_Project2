const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { requireListOwner } = require('../middleware/ownership');
const { STARTER_USERNAME } = require('../lib/starter');
const router = express.Router();

// Anyone can view. Only the owner can change a list or its entries (anyone else gets a 400).

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;
const ENTRIES_PER_PAGE = 20;

// Ids must be whole numbers ("/lists/5abc" would otherwise match list 5 in MySQL)
router.param('listId', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) {
    return res.status(404).render('error', { title: 'List not found', message: "That list doesn't exist." });
  }
  next();
});

// Every template for the "pick a template" dropdown: the user's own, then starters, then others
async function loadTemplateChoices(userId) {
  const [templates] = await db.query(`
    SELECT t.template_id, t.name, u.username, t.user_id = ? AS is_mine, u.username = ? AS is_starter
    FROM \`template\` t
    JOIN \`user\` u ON u.user_id = t.user_id
    ORDER BY is_mine DESC, is_starter DESC, t.name
  `, [userId, STARTER_USERNAME]);
  return templates;
}

async function renderNewForm(res, status, userId, { errors = [], values }) {
  const templates = await loadTemplateChoices(userId);
  res.status(status).render('lists/new', { errors, values, templates });
}

// All lists, newest first. ?q= searches list and template names; ?owner=mine shows only yours.
router.get('/', async (req, res, next) => {
  const q = String(req.query.q || '').trim();
  const owner = req.query.owner === 'mine' && req.session.userId ? 'mine' : 'all';

  try {
    const where = [];
    const params = [];
    if (q) {
      where.push('(l.name LIKE ? OR t.name LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (owner === 'mine') {
      where.push('l.user_id = ?');
      params.push(req.session.userId);
    }

    const [lists] = await db.query(`
      SELECT l.list_id, l.user_id, l.name, l.description, l.created_at, u.username,
             t.template_id, t.name AS template_name,
             (SELECT COUNT(*) FROM \`list_entry\` e WHERE e.list_id = l.list_id) AS entry_count
      FROM \`list\` l
      JOIN \`user\` u ON u.user_id = l.user_id
      JOIN \`template\` t ON t.template_id = l.template_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC, l.list_id DESC
    `, params);
    res.render('lists/index', { lists, filters: { q, owner } });
  } catch (err) {
    next(err);
  }
});

// Form: list name + pick a template. ?templateId=5 preselects one.
router.get('/new', requireLogin, async (req, res, next) => {
  try {
    await renderNewForm(res, 200, req.session.userId, {
      values: { name: '', description: '', templateId: String(req.query.templateId || '') },
    });
  } catch (err) {
    next(err);
  }
});

// Save a new list. It follows its template's newest version.
router.post('/', requireLogin, async (req, res, next) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const templateId = String(req.body.templateId || '');
  const values = { name, description, templateId };

  try {
    const errors = [];
    if (!name) errors.push('Give the list a name.');
    if (name.length > MAX_NAME_LENGTH) errors.push(`List name must be ${MAX_NAME_LENGTH} characters or less.`);
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`);
    }

    const [templates] = /^\d+$/.test(templateId)
      ? await db.query('SELECT template_id FROM `template` WHERE template_id = ?', [templateId])
      : [[]];
    if (templates.length === 0) errors.push('Pick a template.');

    if (errors.length) {
      return await renderNewForm(res, 400, req.session.userId, { errors, values });
    }

    const [result] = await db.query(
      'INSERT INTO `list` (user_id, template_id, name, description) VALUES (?, ?, ?, ?)',
      [req.session.userId, templateId, name, description || null]
    );
    res.redirect(`/lists/${result.insertId}`);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return renderNewForm(res, 400, req.session.userId, {
        errors: [`You already have a list called "${name}".`],
        values,
      }).catch(next);
    }
    next(err);
  }
});

// One list as a table: the columns of its template's newest version and its entries,
// 20 per page. ?q= searches the entries' values.
router.get('/:listId', async (req, res, next) => {
  const q = String(req.query.q || '').trim();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  try {
    const [lists] = await db.query(`
      SELECT l.list_id, l.user_id, l.name, l.description, l.created_at, u.username,
             t.template_id, t.name AS template_name, v.version_id, v.version_number
      FROM \`list\` l
      JOIN \`user\` u ON u.user_id = l.user_id
      JOIN \`template\` t ON t.template_id = l.template_id
      JOIN \`template_version\` v ON v.template_id = t.template_id
      WHERE l.list_id = ?
      ORDER BY v.version_number DESC
      LIMIT 1
    `, [req.params.listId]);

    const list = lists[0];
    if (!list) {
      return res.status(404).render('error', { title: 'List not found', message: "That list doesn't exist." });
    }

    const [fields] = await db.query(
      'SELECT name, type FROM `template_field` WHERE version_id = ? ORDER BY sort_order',
      [list.version_id]
    );
    const searchSql = q ? 'AND CAST(e.data AS CHAR) LIKE ?' : '';
    const searchParams = q ? [`%${q}%`] : [];

    const [[counts]] = await db.query(`
      SELECT COUNT(*) AS total, COALESCE(SUM(e.version_id <> ?), 0) AS outdated
      FROM \`list_entry\` e
      WHERE e.list_id = ?
    `, [list.version_id, list.list_id]);
    const [[{ shown }]] = await db.query(
      `SELECT COUNT(*) AS shown FROM \`list_entry\` e WHERE e.list_id = ? ${searchSql}`,
      [list.list_id, ...searchParams]
    );
    const pages = Math.max(1, Math.ceil(shown / ENTRIES_PER_PAGE));
    const currentPage = Math.min(page, pages);

    const [entries] = await db.query(`
      SELECT e.entry_id, e.data, e.created_at, e.updated_at, v.version_number
      FROM \`list_entry\` e
      JOIN \`template_version\` v ON v.version_id = e.version_id
      WHERE e.list_id = ? ${searchSql}
      ORDER BY e.entry_id
      LIMIT ? OFFSET ?
    `, [list.list_id, ...searchParams, ENTRIES_PER_PAGE, (currentPage - 1) * ENTRIES_PER_PAGE]);

    const isOwner = req.session.userId === list.user_id;
    // Set by the "update old entries" page when it redirects back here
    const upgradeResult = req.query.upgraded !== undefined
      ? { upgraded: Number(req.query.upgraded) || 0, remaining: Number(req.query.remaining) || 0 }
      : null;
    res.render('lists/show', {
      list,
      fields,
      entries,
      isOwner,
      upgradeResult,
      entryAdded: req.query.added === '1', // set after "Add entry" so the page can say so
      totalEntries: counts.total,
      outdatedCount: Number(counts.outdated),
      filters: { q },
      pagination: { page: currentPage, pages, total: shown, perPage: ENTRIES_PER_PAGE },
    });
  } catch (err) {
    next(err);
  }
});

// Delete a list and all its entries
router.post('/:listId/delete', requireLogin, requireListOwner, async (req, res, next) => {
  try {
    await db.query('DELETE FROM `list` WHERE list_id = ?', [req.params.listId]);
    res.redirect('/lists');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
