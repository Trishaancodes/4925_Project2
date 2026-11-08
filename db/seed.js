// Adds the starter templates (lib/starter.js). Safe to run again: existing ones are skipped.
// Run with: npm run db:seed
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./index');
const { STARTER_USERNAME, STARTER_TEMPLATES } = require('../lib/starter');

async function seed() {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    let [[owner]] = await conn.query('SELECT user_id FROM `user` WHERE username = ?', [STARTER_USERNAME]);
    if (!owner) {
      // Random password nobody knows, so the account can't be logged in to
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
      const [result] = await conn.query(
        'INSERT INTO `user` (username, email, password_hash) VALUES (?, ?, ?)',
        [STARTER_USERNAME, 'starter-templates@localhost.invalid', passwordHash]
      );
      owner = { user_id: result.insertId };
    }

    for (const template of STARTER_TEMPLATES) {
      const [[existing]] = await conn.query(
        'SELECT template_id FROM `template` WHERE user_id = ? AND name = ?',
        [owner.user_id, template.name]
      );
      if (existing) {
        console.log(`Skipped "${template.name}" (already there)`);
        continue;
      }

      const [templateResult] = await conn.query(
        'INSERT INTO `template` (user_id, name) VALUES (?, ?)',
        [owner.user_id, template.name]
      );
      const [versionResult] = await conn.query(
        'INSERT INTO `template_version` (template_id, version_number) VALUES (?, 1)',
        [templateResult.insertId]
      );
      const rows = template.fields.map((f, i) => [
        versionResult.insertId, f.name, f.type, f.isRequired, f.rules ? JSON.stringify(f.rules) : null, i,
      ]);
      await conn.query(
        'INSERT INTO `template_field` (version_id, name, type, is_required, rules, sort_order) VALUES ?',
        [rows]
      );
      console.log(`Added "${template.name}"`);
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
  });
