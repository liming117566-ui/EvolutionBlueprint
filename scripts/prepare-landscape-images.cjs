// Package the separately generated UI-v2 landscape course covers without touching the app icon.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const boards = require('../miniprogram/utils/board-defaults').defaults();
const source = path.join(root, 'output/imagegen/ui-v2');
const target = path.join(root, 'miniprogram/assets/generated');
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
(async () => {
  fs.mkdirSync(target, { recursive: true });
  const appIcon = path.join(target, 'app-icon.webp');
  const appIconHash = digest(fs.readFileSync(appIcon));
  const report = { format: 'webp', width: 768, height: 432, items: [] };
  for (const board of boards) {
    const id = board.id.toLowerCase();
    const file = path.join(source, id + '.png');
    const metadata = await sharp(file).metadata();
    if (!(metadata.width > metadata.height)) throw new Error('Expected landscape original for ' + id);
    let quality = 84;
    let output;
    do {
      output = await sharp(file).resize(768, 432, { fit: 'cover', position: 'centre' }).webp({ quality }).toBuffer();
      quality -= 5;
    } while (output.length > 50 * 1024 && quality >= 54);
    if (output.length > 50 * 1024) throw new Error('Landscape image exceeds 50 KiB: ' + id);
    const filename = id + '-landscape.webp';
    fs.writeFileSync(path.join(target, filename), output);
    report.items.push({ id: board.id, title: board.title, source: 'output/imagegen/ui-v2/' + id + '.png', sourceWidth: metadata.width, sourceHeight: metadata.height, sourceSha256: digest(fs.readFileSync(file)), packaged: '/assets/generated/' + filename, bytes: output.length, sha256: digest(output) });
  }
  if (digest(fs.readFileSync(appIcon)) !== appIconHash) throw new Error('The existing app icon must remain unchanged');
  report.count = report.items.length;
  report.totalBytes = report.items.reduce((sum, item) => sum + item.bytes, 0);
  report.appIconUnchanged = true;
  fs.writeFileSync(path.join(source, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log('Packaged', report.count, 'landscape covers;', Math.round(report.totalBytes / 1024), 'KiB; existing app icon retained');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
