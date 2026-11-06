const express = require('express');
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { requireTemplateOwner } = require('../middleware/ownership');
const { FIELD_TYPES, parseTemplateForm } = require('../lib/templateForm');
const router = express.Router();

// Anyone can view. Only the owner can edit or delete (anyone else gets a 400).

// Ids must be whole numbers ("/templates/5abc" would otherwise match template 5 in MySQL)
router.param('templateId', (req, res, next, id) => {
  if (!/^\d+$/.test(id)) {
    return res.status(404).render('error', { title: 'Template not found', message: "That template doesn't exist." });
  }
  next();
});

// `edit` is null on the new-template page, or { templateId, originalName, versionNumber, entryCount }
function renderForm(res, status, { errors = [], values, edit = null }) {
  res.status(status).render('templates/form', { errors, values, edit, fieldTypes: FIELD_TYPES });
}

async function insertFields(conn, versionId, fields) {
  const rows = fields.map((f, i) => [
    versionId, f.name, f.type, f.isRequired, f.rules ? JSON.stringify(f.rules) : null, i,
  ]);
  await conn.query(
    'INSERT INTO `template_field` (version_id, name, type, is_required, rules, sort_order) VALUES ?',
    [rows]
  );
}

// The template with its newest version, plus how many list entries use that version.
// Pass a transaction connection and lock=true to lock the rows while editing.
async function loadLatest(conn, templateId, lock = false) {
  const [rows] = await conn.query(`
    SELECT t.template_id, t.name, v.version_id, v.version_number,
           (SELECT COUNT(*) FROM \`list_entry\` e WHERE e.version_id = v.version_id) AS entry_count
    FROM \`template\` t
    JOIN \`template_version\` v ON v.template_id = t.template_id
    WHERE t.template_id = ?
    ORDER BY v.version_number DESC
    LIMIT 1
    ${lock ? 'FOR UPDATE' : ''}
  `, [templateId]);
  return rows[0];
}

async function loadFields(conn, versionId) {
  const [fields] = await conn.query(
    'SELECT name, type, is_required, rules FROM `template_field` WHERE version_id = ? ORDER BY sort_order',
    [versionId]
  );
  return fields;
}

// Same columns, types, required flags, rules and order?
function sameFields(saved, submitted) {
  const normalize = (f) => JSON.stringify([f.name, f.type, Boolean(f.isRequired ?? f.is_required), f.rules || null]);
  return saved.length === submitted.length && saved.every((f, i) => normalize(f) === normalize(submitted[i]));
}

// All templates, newest first, with the column count of each one's latest version
router.get('/', async (req, res, next) => {
  try {
    const [templates] = await db.query(`
      SELECT t.template_id, t.name, t.created_at, u.username,
             v.version_number, COUNT(f.field_id) AS field_count
      FROM \`template\` t
      JOIN \`user\` u ON u.user_id = t.user_id
      JOIN \`template_version\` v ON v.template_id = t.template_id
       AND v.version_number = (SELECT MAX(version_number) FROM \`template_version\` WHERE template_id = t.template_id)
      LEFT JOIN \`template_field\` f ON f.version_id = v.version_id
      GROUP BY t.template_id, t.name, t.created_at, u.username, v.version_number
      ORDER BY t.created_at DESC, t.template_id DESC
    `);
    res.render('templates/index', { templates });
  } catch (err) {
    next(err);
  }
});

// Form to build a new template (name + columns)
// Must come before /:templateId so "new" isn't treated as an id
router.get('/new', requireLogin, (req, res) => {
  const values = { name: '', fields: [{ name: '', type: 'text', isRequired: false, optionsText: '' }] };
  renderForm(res, 200, { values });
});

// Save a new template, its version 1 and its fields. All or nothing (one transaction).
router.post('/', requireLogin, async (req, res, next) => {
  const { errors, template, values } = parseTemplateForm(req.body);
  if (errors.length) {
    return renderForm(res, 400, { errors, values });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [templateResult] = await conn.query(
      'INSERT INTO `template` (user_id, name) VALUES (?, ?)',
      [req.session.userId, template.name]
    );
    const templateId = templateResult.insertId;

    const [versionResult] = await conn.query(
      'INSERT INTO `template_version` (template_id, version_number) VALUES (?, 1)',
      [templateId]
    );
    await insertFields(conn, versionResult.insertId, template.fields);

    await conn.commit();
    res.redirect(`/templates/${templateId}`);
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 400, { errors: [`You already have a template called "${template.name}".`], values });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// One template and the columns of its latest version
router.get('/:templateId', async (req, res, next) => {
  try {
    const [templates] = await db.query(`
      SELECT t.template_id, t.user_id, t.name, t.created_at, u.username, v.version_id, v.version_number,
             (SELECT COUNT(*) FROM \`list\` l WHERE l.template_id = t.template_id) AS list_count
      FROM \`template\` t
      JOIN \`user\` u ON u.user_id = t.user_id
      JOIN \`template_version\` v ON v.template_id = t.template_id
      WHERE t.template_id = ?
      ORDER BY v.version_number DESC
      LIMIT 1
    `, [req.params.templateId]);

    const template = templates[0];
    if (!template) {
      return res.status(404).render('error', { title: 'Template not found', message: "That template doesn't exist." });
    }

    const fields = await loadFields(db, template.version_id);
    const isOwner = req.session.userId === template.user_id;
    res.render('templates/show', { template, fields, isOwner, fieldTypes: FIELD_TYPES });
  } catch (err) {
    next(err);
  }
});

// Edit form, filled in with the newest version's columns
router.get('/:templateId/edit', requireLogin, requireTemplateOwner, async (req, res, next) => {
  try {
    const latest = await loadLatest(db, req.params.templateId);
    const fields = await loadFields(db, latest.version_id);

    const values = {
      name: latest.name,
      fields: fields.map((f) => ({
        name: f.name,
        type: f.type,
        isRequired: Boolean(f.is_required),
        optionsText: f.rules && f.rules.options ? f.rules.options.join(', ') : '',
      })),
    };
    const edit = {
      templateId: latest.template_id,
      originalName: latest.name,
      versionNumber: latest.version_number,
      entryCount: latest.entry_count,
    };
    renderForm(res, 200, { values, edit });
  } catch (err) {
    next(err);
  }
});

// Save changes. If list entries were saved under the newest version, the new columns go into
// a new version so those entries keep the rules they were checked against. Otherwise the newest
// version is changed in place (nothing depends on it yet).
router.post('/:templateId/edit', requireLogin, requireTemplateOwner, async (req, res, next) => {
  const { errors, template, values } = parseTemplateForm(req.body);
  const templateId = Number(req.params.templateId);
  let edit;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Lock so two saves at once can't both create the same version number
    const latest = await loadLatest(conn, templateId, true);
    edit = {
      templateId,
      originalName: latest.name,
      versionNumber: latest.version_number,
      entryCount: latest.entry_count,
    };

    if (errors.length) {
      await conn.rollback();
      return renderForm(res, 400, { errors, values, edit });
    }

    if (template.name !== latest.name) {
      await conn.query('UPDATE `template` SET name = ? WHERE template_id = ?', [template.name, templateId]);
    }

    const savedFields = await loadFields(conn, latest.version_id);
    if (!sameFields(savedFields, template.fields)) {
      if (latest.entry_count > 0) {
        const [versionResult] = await conn.query(
          'INSERT INTO `template_version` (template_id, version_number) VALUES (?, ?)',
          [templateId, latest.version_number + 1]
        );
        await insertFields(conn, versionResult.insertId, template.fields);
      } else {
        await conn.query('DELETE FROM `template_field` WHERE version_id = ?', [latest.version_id]);
        await insertFields(conn, latest.version_id, template.fields);
      }
    }

    await conn.commit();
    res.redirect(`/templates/${templateId}`);
  } catch (err) {
    if (conn) await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return renderForm(res, 400, { errors: [`You already have a template called "${template.name}".`], values, edit });
    }
    next(err);
  } finally {
    if (conn) conn.release();
  }
});

// Delete a template and all its versions. Not allowed while a list uses it,
// because that would wipe out the rules those lists' entries depend on.
router.post('/:templateId/delete', requireLogin, requireTemplateOwner, async (req, res, next) => {
  try {
    const [[{ list_count: listCount }]] = await db.query(
      'SELECT COUNT(*) AS list_count FROM `list` WHERE template_id = ?',
      [req.params.templateId]
    );
    if (listCount > 0) {
      return res.status(400).render('error', {
        title: "Can't delete this template",
        message: `${listCount} ${listCount === 1 ? 'list uses' : 'lists use'} this template. Delete those lists first.`,
      });
    }

    await db.query('DELETE FROM `template` WHERE template_id = ?', [req.params.templateId]);
    res.redirect('/templates');
  } catch (err) {
    // A list was created between the check and the delete; the foreign key stopped it
    if (err.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).render('error', {
        title: "Can't delete this template",
        message: 'A list uses this template. Delete that list first.',
      });
    }
    next(err);
  }
});

module.exports = router;
