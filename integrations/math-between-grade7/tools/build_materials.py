"""Build read-only HTML materials from the original DOCX files, preserving OLE previews."""
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
import hashlib, json, re, html, posixpath
from catalog_helpers import chapter_for,version_for

ROOT=Path(__file__).resolve().parent.parent
WEB=ROOT/'web'
(WEB/'materials').mkdir(parents=True,exist_ok=True)
(WEB/'media').mkdir(exist_ok=True)
(ROOT/'work'/'metafiles').mkdir(parents=True,exist_ok=True)
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','v':'urn:schemas-microsoft-com:vml','a':'http://schemas.openxmlformats.org/drawingml/2006/main','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing'}
def tag(e):return e.tag.split('}')[-1]
def attr(e,k,d=''):return e.get('{'+NS['w']+'}'+k,d)
seen={}; manifest=[]; all_docs=[]
chapters=['丰富的图形世界','有理数及其运算','整式及其加减','基本平面图形','一元一次方程','数据的收集与整理']
def chapter(p):
 return chapter_for(p)
def image(b,n):
 h=hashlib.sha256(b).hexdigest()[:24]
 if h in seen:return seen[h]
 ext=Path(n).suffix.lower()
 if ext in ['.wmf','.emf']:
  target=ROOT/'work'/'metafiles'/(h+ext);target.write_bytes(b)
  url='../media/'+h+'.png';manifest.append(str(target))
 else:
  ext=ext if ext in ['.png','.jpg','.jpeg','.gif'] else '.png'
  (WEB/'media'/(h+ext)).write_bytes(b);url='../media/'+h+ext
 seen[h]=url;return url

for ix,p in enumerate(sorted(ROOT.rglob('*.docx'))):
 if 'web' in p.relative_to(ROOT).parts or 'work' in p.relative_to(ROOT).parts:continue
 with ZipFile(p) as z:
  tree=ET.fromstring(z.read('word/document.xml'))
  rels={e.attrib['Id']:e.attrib.get('Target','') for e in ET.fromstring(z.read('word/_rels/document.xml.rels'))}
  def get_img(rid,w=None,h=None):
   target=posixpath.normpath('word/'+rels.get(rid,''))
   if target not in z.namelist():return ''
   url=image(z.read(target),target)
   style=''
   if w:style=f'width:{round(w,2)}px;'
   kind='formula' if h and h<45 else 'figure'
   return f'<img class="{kind}" src="{url}" style="{style}" alt="讲义公式或题图" loading="lazy">'
  def render(e):
   t=tag(e)
   if t in ['pPr','rPr','sectPr','tblPr','tcPr','trPr','tblGrid','objectPr']:return ''
   if t=='t':return html.escape(e.text or '')
   if t=='tab':return '&emsp;'
   if t in ['br','cr']:return '<br>'
   if t in ['object','pict']:
    out=[]
    for shape in e.findall('.//v:shape',NS):
     im=shape.find('.//v:imagedata',NS)
     if im is None:continue
     sty=shape.attrib.get('style','');mw=re.search(r'width:([\d.]+)pt',sty);mh=re.search(r'height:([\d.]+)pt',sty)
     out.append(get_img(im.attrib.get('{'+NS['r']+'}id',''),float(mw[1])*4/3 if mw else None,float(mh[1])*4/3 if mh else None))
    return ''.join(out)
   if t=='drawing':
    ext=e.find('.//wp:extent',NS);w=int(ext.attrib.get('cx',0))/9525 if ext is not None else None;h=int(ext.attrib.get('cy',0))/9525 if ext is not None else None
    return ''.join(get_img(im.attrib.get('{'+NS['r']+'}embed',''),w,h) for im in e.findall('.//a:blip',NS))
   inside=''.join(render(c) for c in e)
   if t=='r':
    rp=e.find('w:rPr',NS)
    if rp is not None:
     if rp.find('w:b',NS) is not None:inside='<b>'+inside+'</b>'
     va=rp.find('w:vertAlign',NS)
     if va is not None and attr(va,'val') in ['superscript','subscript']:
      tx='sup' if attr(va,'val')=='superscript' else 'sub';inside=f'<{tx}>{inside}</{tx}>'
     under=rp.find('w:u',NS)
     if under is not None:inside='<u>'+inside+'</u>'
    return inside
   if t=='p':
    text=''.join(e.itertext()).strip();heading=bool(re.match(r'^(知识点\d|题型\d|教学目标|教学重难点|考点|【知识)',text))
    return ('<h2>'+inside+'</h2>' if heading else '<p>'+inside+'</p>') if inside else '<p class="blank"></p>'
   if t=='tbl':return '<div class="table-wrap"><table>'+inside+'</table></div>'
   if t=='tr':return '<tr>'+inside+'</tr>'
   if t=='tc':
    span=e.find('w:tcPr/w:gridSpan',NS);s=f' colspan="{attr(span,"val")}"' if span is not None else ''
    return f'<td{s}>'+inside+'</td>'
   return inside
  body=render(tree.find('w:body',NS))
  paras=[''.join(el.itertext()).strip() for el in tree.findall('.//w:p',NS)]
  title=p.stem.strip();did=f'doc-{ix+1:03}'
  document='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+html.escape(title)+'</title><link rel="stylesheet" href="../reader.css"></head><body><article>'+body+'</article></body></html>'
  (WEB/'materials'/(did+'.html')).write_text(document,encoding='utf-8')
  suite=1 if '第1套' in str(p) else 2 if '第2套' in str(p) else 3
  headings=[s for s in paras if re.match(r'^(知识点|题型|考点|【典例|专题|第\d+讲)',s)][:35]
  version,edition=version_for(title)
  all_docs.append({'id':did,'title':title,'chapter':chapter(p),'suite':suite,'version':version,'edition':edition,'kind':'专项训练' if '专项训练' in str(p) or '技巧专题' in title else '复习讲义' if '复习' in str(p) or '单元' in title else '专题讲义','url':'materials/'+did+'.html','source':p.relative_to(ROOT).as_posix(),'keywords':' '.join(headings)[:1600]})
  if (ix+1)%50==0:print('Prepared',ix+1,flush=True)
(WEB/'materials-data.js').write_text('window.MATERIALS='+json.dumps(all_docs,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
(ROOT/'work'/'metafiles.json').write_text(json.dumps(manifest,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'documents':len(all_docs),'unique_images':len(seen),'metafiles':len(manifest),'chapters':{str(i):sum(d['chapter']==i for d in all_docs) for i in range(1,7)}},ensure_ascii=False),flush=True)
