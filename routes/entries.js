const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { requireListOwner, requireEntryOwner } = require('../middleware/ownership');
const { validateEntry } = require('../lib/validate');

// mergeParams lets us read :listId from the parent path /lists/:listId/entries
const router = express.Router({ mergeParams: true });

// Every save is validated server-side against the newest version of the list's template.
// Form inputs are named f_0, f_1... in column order (column names can contain any characters).

// The list plus its template's newest version and that version's columns
async function loadList(listId) {
  const [lists] = await db.query(`
    SELECT l.list_id, l.name, v.version_id, v.version_number
    FROM \`list\` l
    JOIN \`template_version\` v ON v.template_id = l.template_id
    WHERE l.list_id = ?
    ORDER BY v.version_number DESC
    LIMIT 1
  `, [listId]);
  const list = lists[0];

  const [fields] = await db.query(
    'SELECT name, type, is_required, rules FROM `template_field` WHERE version_id = ? ORDER BY sort_order',
    [list.version_id]
  );
  return { list, fields };
}

async function loadEntry(entryId) {
  const [entries] = await db.query(`
    SELECT e.entry_id, e.data, v.version_number
    FROM \`list_entry\` e
    JOIN \`template_version\` v ON v.version_id = e.version_id
    WHERE e.entry_id = ?
  `, [entryId]);
  return entries[0];
}

// Submitted values in column order, for showing the form again after an error
function submittedValues(body, fields) {
  return fields.map((f, i) => {
    const raw = body[`f_${i}`];
    return Array.isArray(raw) ? raw[raw.length - 1] : raw;
  });
}

function renderForm(res, status, { list, fields, entry = null, values, errors = [] }) {
  res.status(status).render('entries/form', { list, fields, entry, values, errors });
}

// Form with one input per column
router.get('/new', requireLogin, requireListOwner, async (req, res, next) => {
  try {
    const { list, fields } = await loadList(req.params.listId);
    renderForm(res, 200, { list, fields, values: [] });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireLogin, requireListOwner, async (req, res, next) => {
  try {
    const { list, fields } = await loadList(req.params.listId);
    const { data, errors } = validateEntry(fields, (f, i) => req.body[`f_${i}`]);
    if (errors.length) {
      return renderForm(res, 400, { list, fields, values: submittedValues(req.body, fields), errors });
    }

    await db.query(
      'INSERT INTO `list_entry` (list_id, version_id, data) VALUES (?, ?, ?)',
      [list.list_id, list.version_id, JSON.stringify(data)]
    );
    res.redirect(`/lists/${list.list_id}?added=1`); // the list page shows an "Entry Added" popup
  } catch (err) {
    next(err);
  }
});

// Bring entries saved under older versions up to the newest version.
// Must come before /:entryId routes.
router.get('/upgrade', requireLogin, requireListOwner, async (req, res, next) => {
  try {
    res.render('entries/upgrade', await buildUpgradePlan(req.params.listId));
  } catch (err) {
    next(err);
  }
});

// Fills blank columns with the owner's default values, then upgrades every old entry that
// now passes the newest rules. Entries that still fail stay on their version and are listed.
router.post('/upgrade', requireLogin, requireListOwner, async (req, res, next) => {
  let conn;
  try {
    const plan = await buildUpgradePlan(req.params.listId, req.body);
    const { list, fields, defaults, oldEntries } = plan;

    // A default value must itself be valid for its column
    const defaultCheck = validateEntry(
      fields.filter((f, i) => defaults[i] !== undefined && defaults[i] !== ''),
      (f) => defaults[fields.indexOf(f)]
    );
    if (defaultCheck.errors.length) {
      return res.status(400).render('entries/upgrade', { ...plan, errors: defaultCheck.errors.map((e) => `Default: ${e.message}`) });
    }

    const upgrades = [];
    for (const entry of oldEntries) {
      const { data, errors } = validateEntry(fields, (f, i) => {
        const current = entry.data[f.name];
        return current === undefined || current === null || current === '' ? defaults[i] : current;
      });
      if (errors.length === 0) upgrades.push([JSON.stringify(data), list.version_id, entry.entry_id]);
    }

    conn = await db.getConnection();
    await conn.beginTransaction();
    for (const params of upgrades) {
      await conn.query('UPDATE `list_entry` SET data = ?, version_id = ? WHERE entry_id = ?', params);
    }
    await conn.commit();

    const remaining = oldEntries.length - upgrades.length;
    res.redirect(`/lists/${list.list_id}?upgraded=${upgrades.length}&remaining=${remaining}`);
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Works out which old entries already pass the newest rules, what each failing one is missing,
// which columns need a default value, and which old columns would be dropped.
// `body` is the submitted defaults form (f_0, f_1...), if any.
async function buildUpgradePlan(listId, body = {}) {
  const { list, fields } = await loadList(listId);
  const defaults = submittedValues(body, fields);
  const [rows] = await db.query(`
    SELECT e.entry_id, e.data, v.version_number
    FROM \`list_entry\` e
    JOIN \`template_version\` v ON v.version_id = e.version_id
    WHERE e.list_id = ? AND e.version_id <> ?
    ORDER BY e.entry_id
  `, [list.list_id, list.version_id]);

  const fieldNames = new Set(fields.map((f) => f.name));
  const needsDefault = new Set();
  const droppedColumns = new Set();

  const oldEntries = rows.map((entry) => {
    const { errors } = validateEntry(fields, (f) => entry.data[f.name]);
    errors.forEach((e) => {
      const blank = [undefined, null, ''].includes(entry.data[e.field]);
      if (blank) needsDefault.add(e.field);
    });
    Object.keys(entry.data).forEach((key) => { if (!fieldNames.has(key)) droppedColumns.add(key); });
    return { ...entry, problems: errors.map((e) => e.message) };
  });

  return {
    list,
    fields,
    defaults,
    oldEntries,
    needsDefault: fields.map((f) => needsDefault.has(f.name)),
    droppedColumns: [...droppedColumns],
    errors: [],
  };
}

router.get('/:entryId/edit', requireLogin, requireEntryOwner, async (req, res, next) => {
  try {
    const { list, fields } = await loadList(req.params.listId);
    const entry = await loadEntry(req.params.entryId);
    renderForm(res, 200, { list, fields, entry, values: fields.map((f) => entry.data[f.name]) });
  } catch (err) {
    next(err);
  }
});

// Saving an entry checks it against the newest version and moves it to that version
router.post('/:entryId/edit', requireLogin, requireEntryOwner, async (req, res, next) => {
  try {
    const { list, fields } = await loadList(req.params.listId);
    const { data, errors } = validateEntry(fields, (f, i) => req.body[`f_${i}`]);
    if (errors.length) {
      const entry = await loadEntry(req.params.entryId);
      return renderForm(res, 400, { list, fields, entry, values: submittedValues(req.body, fields), errors });
    }

    await db.query(
      'UPDATE `list_entry` SET data = ?, version_id = ? WHERE entry_id = ?',
      [JSON.stringify(data), list.version_id, req.params.entryId]
    );
    res.redirect(`/lists/${list.list_id}`);
  } catch (err) {
    next(err);
  }
});

router.post('/:entryId/delete', requireLogin, requireEntryOwner, async (req, res, next) => {
  try {
    await db.query('DELETE FROM `list_entry` WHERE entry_id = ?', [req.params.entryId]);
    res.redirect(`/lists/${req.params.listId}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
