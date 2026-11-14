const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { backup, DatabaseSync } = require('node:sqlite');
const { loadConfig } = require('../server/config');
const { openDatabase } = require('../server/db');
const { initCatalog } = require('../server/catalog');
const { id, now, passwordHash } = require('../server/security');
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
async function main() {
  const command = process.argv[2];
  if (command === 'restore') {
    const source = path.resolve(process.argv[3] || '');
    const target = process.argv[4] && path.resolve(process.argv[4]);
    if (!target || target === source || (fs.existsSync(target) && fs.readdirSync(target).length)) throw new Error('恢复必须指定备份目录与新的空目标目录，不覆盖原数据');
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || !manifest.complete || !Array.isArray(manifest.files)) throw new Error('备份不完整');
    for (const item of manifest.files) {
      if (!/^(blueprint\.sqlite|uploads\/[A-Za-z0-9_.-]+)$/.test(item.path)) throw new Error('备份路径无效');
      const bytes = fs.readFileSync(path.join(source, item.path));
      if (crypto.createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw new Error('备份文件校验失败');
    }
    fs.mkdirSync(target, { recursive: true });
    for (const item of manifest.files) { const dest = path.join(target, item.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(path.join(source, item.path), dest, fs.constants.COPYFILE_EXCL); }
    console.log('已恢复到新目录：', target); return;
  }
  const config = loadConfig();
  const store = openDatabase(config.dataDir);
  try {
    initCatalog(store);
    if (command === 'init-admin' || command === 'reset-password') {
      const username = process.env.ADMIN_USERNAME;
      if (!username || !/^[A-Za-z0-9_.-]{3,60}$/.test(username)) throw new Error('请用 ADMIN_USERNAME 设置 3–60 位管理员账号');
      const encoded = await passwordHash(process.env.ADMIN_PASSWORD);
      const old = store.get('SELECT id FROM admins WHERE username=?', username);
      if (command === 'init-admin' && old) throw new Error('账号已存在；如需改密请使用 reset-password');
      if (command === 'reset-password' && !old) throw new Error('账号不存在');
      store.transaction(() => {
        if (old) { store.run('UPDATE admins SET password=? WHERE id=?', encoded, old.id); store.run('DELETE FROM admin_sessions WHERE admin_id=?', old.id); }
        else store.run('INSERT INTO admins VALUES(?,?,?,?)', id(), username, encoded, now());
      });
      console.log(command === 'init-admin' ? '管理员已创建，密码不会输出到日志。' : '密码已更新，旧会话已撤销。');
    } else if (command === 'backup') {
      const destination = process.argv[3] && path.resolve(process.argv[3]);
      if (!destination || fs.existsSync(destination)) throw new Error('请指定不存在的新备份目录');
      if (destination === config.dataDir || destination.startsWith(config.dataDir + path.sep)) throw new Error('备份目录不得放入活动数据目录');
      fs.mkdirSync(destination, { recursive: true });
      const sqlitePath = path.join(destination, 'blueprint.sqlite');
      await backup(store.db, sqlitePath);
      const snapshot = new DatabaseSync(sqlitePath, { readOnly: true });
      const assets = snapshot.prepare('SELECT storage_name FROM assets').all(); snapshot.close();
      const relative = ['blueprint.sqlite'];
      for (const asset of assets) {
        if (!/^[A-Za-z0-9_-]+\.(pdf|doc|docx|webp)$/.test(asset.storage_name)) throw new Error('资产名称无效');
        fs.mkdirSync(path.join(destination, 'uploads'), { recursive: true });
        fs.copyFileSync(path.join(config.dataDir, 'uploads', asset.storage_name), path.join(destination, 'uploads', asset.storage_name));
        relative.push('uploads/' + asset.storage_name);
      }
      const files = relative.map(file => ({ path: file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(destination, file))).digest('hex') }));
      fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify({ version: 1, complete: true, createdAt: now(), files }, null, 2), { flag: 'wx' });
      console.log('一致性备份完成：', destination);
    } else throw new Error('用法：init-admin | reset-password | backup <新目录> | restore <备份目录> <空目标目录>');
  } finally { store.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
