// Creates the database (if missing) and all tables. Run with: npm run db:setup
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { connectionConfig } = require('./index');

async function setup() {
  const conn = await mysql.createConnection({ ...connectionConfig, multipleStatements: true });

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await conn.query(`USE \`${process.env.DB_NAME}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await conn.end();

  console.log(`Database "${process.env.DB_NAME}" is ready.`);
  process.exit(0); // the app's pool from ./index keeps Node alive otherwise
}

setup().catch((err) => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
