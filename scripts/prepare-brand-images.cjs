// Package optimized app images from the separately generated, full-size source images.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const boards = require('../miniprogram/utils/board-defaults').defaults();
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'output/imagegen');
const target = path.join(root, 'miniprogram/assets/generated');
(async () => {
  fs.mkdirSync(target, { recursive: true });
  await sharp(path.join(source, 'xinbotu-app-icon.png')).resize(256, 256).webp({ quality: 94 }).toFile(path.join(target, 'app-icon.webp'));
  await sharp(path.join(source, 'home-hero.png')).resize({ width: 960 }).webp({ quality: 84 }).toFile(path.join(target, 'home-hero.webp'));
  for (const board of boards) {
    const id = board.id.toLowerCase(), file = path.join(source, id + '.png');
    await sharp(file).resize(576, 576, { fit: 'contain', background: '#f8f8f9' }).webp({ quality: 84 }).toFile(path.join(target, id + '-cover.webp'));
    await sharp(file).resize(192, 192, { fit: 'contain', background: '#f8f8f9' }).webp({ quality: 86 }).toFile(path.join(target, id + '-icon.webp'));
  }
  const total = fs.readdirSync(target).reduce((sum, file) => sum + fs.statSync(path.join(target, file)).size, 0);
  console.log('Packaged', boards.length + ' board covers and icons + home hero;', Math.round(total / 1024) + ' KiB');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
