"""Render local annotated books for an offline, zoomable reader."""
from pathlib import Path
import json
import pymupdf

ROOT = Path(__file__).resolve().parents[1]
pymupdf.TOOLS.mupdf_display_errors(False)
pymupdf.TOOLS.mupdf_display_warnings(False)
books = [
    ('7a', '七上生物课堂笔记 （人教版）.pdf', '七年级上册', 5),
    ('7b', '2026新七下生物课堂笔记（人教版）.pdf', '七年级下册', 5),
    ('8a', '八上生物课堂笔记（人教版）.pdf', '八年级上册', 4),
    ('8b', '2026新八下生物课堂笔记（人教版）.pdf', '八年级下册', 6),
]
manifest = []
for code, filename, title, offset in books:
    doc = pymupdf.open(ROOT / filename)
    folder = ROOT / 'web' / 'pages' / code
    folder.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(doc):
        dest = folder / f'{index+1:03}.jpg'
        if not dest.exists():
            scale = 1500 / page.rect.width
            page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False).save(dest, jpg_quality=82)
        if (index+1) % 40 == 0:
            print(f'{code}: {index+1}/{len(doc)}', flush=True)
    manifest.append(dict(id=code, title=title, file=filename, pages=len(doc), offset=offset))
    print(f'{code}: ready ({len(doc)} pages)', flush=True)
(ROOT / 'web' / 'books.js').write_text('window.BOOKS = '+json.dumps(manifest, ensure_ascii=False, indent=2)+';\n', encoding='utf-8')
