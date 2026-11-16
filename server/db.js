const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const { isDefaultNickname, randomNickname } = require('./usernames');
function openDatabase(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'blueprint.sqlite'));
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations(version INTEGER PRIMARY KEY,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL,draft TEXT NOT NULL,published TEXT NOT NULL,published_version INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(id INTEGER PRIMARY KEY,body TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,type TEXT NOT NULL,parent TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admins(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES admins(id),csrf TEXT NOT NULL,expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,openid TEXT NOT NULL UNIQUE,nickname TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL,last_login_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS grants(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),scope TEXT NOT NULL,course_ids TEXT NOT NULL,expires_at TEXT,revoked_at TEXT,reason TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS batches(id TEXT PRIMARY KEY,title TEXT NOT NULL,count INTEGER NOT NULL,scope TEXT NOT NULL,course_ids TEXT NOT NULL,redeem_expires_at TEXT,access_days INTEGER,disabled INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cards(id TEXT PRIMARY KEY,hash TEXT NOT NULL UNIQUE,mask TEXT NOT NULL,batch_id TEXT NOT NULL REFERENCES batches(id),used_by TEXT REFERENCES users(id),used_at TEXT);
    CREATE TABLE IF NOT EXISTS redemptions(id TEXT PRIMARY KEY,card_id TEXT NOT NULL UNIQUE REFERENCES cards(id),user_id TEXT NOT NULL REFERENCES users(id),grant_id TEXT NOT NULL REFERENCES grants(id),created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assets(id TEXT PRIMARY KEY,title TEXT NOT NULL,original_name TEXT NOT NULL,storage_name TEXT NOT NULL UNIQUE,file_type TEXT NOT NULL,kind TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS materials(id TEXT PRIMARY KEY,asset_id TEXT NOT NULL REFERENCES assets(id),title TEXT NOT NULL,scope TEXT NOT NULL,owner_id TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,published INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS learning_sections(user_id TEXT NOT NULL REFERENCES users(id),section_id TEXT NOT NULL,completed INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,section_id));
    CREATE TABLE IF NOT EXISTS learning_positions(user_id TEXT NOT NULL REFERENCES users(id),course_id TEXT NOT NULL,chapter_id TEXT NOT NULL,section_id TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,course_id));
    CREATE TABLE IF NOT EXISTS legacy_chapters(user_id TEXT NOT NULL REFERENCES users(id),chapter_id TEXT NOT NULL,PRIMARY KEY(user_id,chapter_id));
    CREATE TABLE IF NOT EXISTS imports(user_id TEXT NOT NULL REFERENCES users(id),import_id TEXT NOT NULL,PRIMARY KEY(user_id,import_id));
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_user_sessions ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_grants_user ON grants(user_id);
    CREATE INDEX IF NOT EXISTS idx_cards_batch ON cards(batch_id);
    INSERT OR IGNORE INTO migrations VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
  `);
  const get = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
  // Existing accounts receive a name once; custom names are never replaced.
  transaction(() => {
    for (const row of all('SELECT id,nickname FROM users')) {
      if (isDefaultNickname(row.nickname)) run('UPDATE users SET nickname=? WHERE id=?', randomNickname({ get }), row.id);
    }
  });
  return { db, get, all, run, transaction, close: () => db.close() };
}
module.exports = { openDatabase };
