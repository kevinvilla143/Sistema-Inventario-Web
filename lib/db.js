const { Pool } = require('pg');
const Database = require('better-sqlite3');

const isPg = !!process.env.DATABASE_URL;

if (isPg) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false });
  module.exports = pool;
} else {
  const db = new Database('dev.db');
  db.pragma('foreign_keys = ON');

  function toSqlite(sql) {
    // remove FOR UPDATE which sqlite doesn't support
    let s = sql.replace(/FOR\s+UPDATE/ig, '');
    // replace $1, $2 ... with ? for sqlite
    s = s.replace(/\$\d+/g, '?');
    return s;
  }

  function isSelect(sql) {
    return /^\s*SELECT/i.test(sql);
  }

  function runQuery(sql, params = []) {
    const s = toSqlite(sql);
    const stmt = db.prepare(s);
    if (isSelect(s)) {
      const rows = stmt.all(params);
      return { rows };
    } else {
      const info = stmt.run(params);
      return { rows: [], info };
    }
  }

  const pool = {
    async query(sql, params = []) {
      return runQuery(sql, params);
    },
    async connect() {
      // return a client-like object with query and release
      return {
        async query(sql, params = []) {
          // handle transaction control statements
          const t = sql.trim().toUpperCase();
          if (t === 'BEGIN' || t === 'COMMIT' || t === 'ROLLBACK') {
            db.exec(t);
            return { rows: [] };
          }
          return runQuery(sql, params);
        },
        release() { /* noop */ }
      };
    }
  };

  module.exports = pool;
}
