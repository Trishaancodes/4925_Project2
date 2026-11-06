const db = require('../db');

const isId = (value) => /^\d+$/.test(String(value));

// Builds middleware that only lets the owner through. `findOwnerId(req)` returns the owner's
// user_id, or undefined if the thing doesn't exist. Use after requireLogin.
// Not found -> 404. Someone else's -> 400 (as the project spec asks).
function requireOwner(thing, plural, findOwnerId) {
  return async (req, res, next) => {
    try {
      const ownerId = await findOwnerId(req);
      if (ownerId === undefined) {
        return res.status(404).render('error', {
          title: `${thing} not found`,
          message: `That ${thing.toLowerCase()} doesn't exist.`,
        });
      }
      if (ownerId !== req.session.userId) {
        return res.status(400).render('error', {
          title: 'Not allowed',
          message: `You can only change your own ${plural}.`,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

async function firstUserId(sql, params) {
  const [rows] = await db.query(sql, params);
  return rows[0] ? rows[0].user_id : undefined;
}

const requireTemplateOwner = requireOwner('Template', 'templates', (req) => {
  if (!isId(req.params.templateId)) return undefined;
  return firstUserId('SELECT user_id FROM `template` WHERE template_id = ?', [req.params.templateId]);
});

const requireListOwner = requireOwner('List', 'lists', (req) => {
  if (!isId(req.params.listId)) return undefined;
  return firstUserId('SELECT user_id FROM `list` WHERE list_id = ?', [req.params.listId]);
});

// The entry must also belong to the list in the URL, so an owner of one list
// can't reach another list's entries through their own list's URL.
const requireEntryOwner = requireOwner('Entry', 'entries', (req) => {
  if (!isId(req.params.listId) || !isId(req.params.entryId)) return undefined;
  return firstUserId(
    'SELECT l.user_id FROM `list_entry` e JOIN `list` l ON l.list_id = e.list_id WHERE e.entry_id = ? AND e.list_id = ?',
    [req.params.entryId, req.params.listId]
  );
});

module.exports = { requireTemplateOwner, requireListOwner, requireEntryOwner };
