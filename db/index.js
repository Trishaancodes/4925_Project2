const fs = require('fs');
const mysql = require('mysql2/promise');

// Cloud hosts like Aiven require SSL; set DB_SSL=true for them.
// With DB_SSL_CA (path to the host's CA certificate) the server's identity is also verified.
function sslConfig() {
  if (process.env.DB_SSL !== 'true') return undefined;
  if (process.env.DB_SSL_CA) return { ca: fs.readFileSync(process.env.DB_SSL_CA, 'utf8') };
  return { rejectUnauthorized: false };
}

// Connection settings shared by the app and db/setup.js.
const connectionConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: sslConfig(),
};

// One shared connection pool for the whole app. Use db.query(sql, [params]) with ? placeholders.
const pool = mysql.createPool({
  ...connectionConfig,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

module.exports = pool;
module.exports.connectionConfig = connectionConfig;
