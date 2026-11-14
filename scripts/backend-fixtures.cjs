'use strict';

// Small deterministic in-memory binary fixtures. No production paths or credentials.
const zlib = require('node:zlib');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Real local headers, central directory, CRCs and EOCD; supports malformed OOXML
// test cases without relying on a magic PK signature or adding dependencies.
function zip(entries, { compress = false } = {}) {
  const local = [], central = [];
  let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const filename = Buffer.from(name), data = Buffer.from(value);
    const packed = compress ? zlib.deflateRawSync(data) : data;
    const method = compress ? 8 : 0, crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
    header.writeUInt16LE(method, 8); header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, packed);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(method, 10); record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(packed.length, 20); record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += header.length + filename.length + packed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const ooxml = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Isolated backend fixture</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'
};
const docx = () => zip(ooxml);

// A small PDF with valid object offsets, xref and trailer (not just %PDF magic).
function pdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>',
    '<< /Length 4 >>\nstream\nq Q\nendstream'
  ];
  let body = '%PDF-1.4\n', offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = Buffer.byteLength(body);
  body += 'xref\n0 5\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('');
  body += `trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}

// Minimal compound-file container with a WordDocument stream. This tests the
// legacy DOC container allowlist, not a promise of full Office interoperability.
function doc() {
  const FREE = 0xffffffff, END = 0xfffffffe, FAT = 0xfffffffd;
  const header = Buffer.alloc(512), fat = Buffer.alloc(512, 0xff), directory = Buffer.alloc(512), stream = Buffer.alloc(4096);
  Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(header);
  header.writeUInt16LE(0x003e, 24); header.writeUInt16LE(3, 26); header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30); header.writeUInt16LE(6, 32); header.writeUInt32LE(1, 44);
  header.writeUInt32LE(1, 48); header.writeUInt32LE(4096, 56); header.writeUInt32LE(END, 60); header.writeUInt32LE(END, 68);
  for (let i = 76; i < 512; i += 4) header.writeUInt32LE(FREE, i);
  header.writeUInt32LE(0, 76); fat.writeUInt32LE(FAT, 0); fat.writeUInt32LE(END, 4);
  for (let sector = 2; sector < 10; sector++) fat.writeUInt32LE(sector === 9 ? END : sector + 1, sector * 4);
  function entry(index, name, type, child, start, size) {
    const base = index * 128, text = Buffer.from(name + '\0', 'utf16le'); text.copy(directory, base);
    directory.writeUInt16LE(text.length, base + 64); directory[base + 66] = type; directory[base + 67] = 1;
    for (const at of [68, 72]) directory.writeUInt32LE(FREE, base + at);
    directory.writeUInt32LE(child, base + 76); directory.writeUInt32LE(start, base + 116); directory.writeBigUInt64LE(BigInt(size), base + 120);
  }
  entry(0, 'Root Entry', 5, 1, END, 0); entry(1, 'WordDocument', 2, FREE, 2, 4096);
  stream.writeUInt16LE(0xa5ec, 0); stream.writeUInt16LE(0x00c1, 2);
  return Buffer.concat([header, fat, directory, stream]);
}

module.exports = { zip, ooxml, pdf, doc, docx };
