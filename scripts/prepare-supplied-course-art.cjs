// Code-native illustrations extending the app's local mathematical icon system.
const fs=require('node:fs');const path=require('node:path');const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const figures={
 'geometry-between':'<path d="M-140 100 0-125 150 100Z" fill="#fff"/><path d="M-140 100 0-125 150 100Z M0-125V100 M-140 100 75-12 M150 100-70-12" fill="none" stroke="#242823" stroke-width="7" stroke-linejoin="round"/><circle cx="0" cy="32" r="25" fill="#f8d849"/><path d="M-90 115Q0 178 135 120" fill="none" stroke="#8e9e6e" stroke-width="9" stroke-linecap="round"/>',
 'geo-bio-exam':'<circle r="145" fill="#fff"/><path d="M-80 72C-144-24-45-103 90-96 119 26 44 113-80 72Z" fill="#e7efe8" stroke="#242823" stroke-width="7"/><path d="M-108 110 67-65 M-44 47-48-14 M2 2 58 8" fill="none" stroke="#242823" stroke-width="7" stroke-linecap="round"/><circle cx="112" cy="94" r="42" fill="#f8d849"/><circle cx="112" cy="94" r="17" fill="none" stroke="#242823" stroke-width="6"/>',
 'math-between-grade7':'<rect x="-155" y="-125" width="310" height="250" rx="24" fill="#fff"/><path d="M-119 79H120 M-91 103V-91" fill="none" stroke="#242823" stroke-width="7" stroke-linecap="round"/><path d="M-68 54-8 8 55 27 111-66" fill="none" stroke="#8e9e6e" stroke-width="10" stroke-linecap="round"/><circle cx="55" cy="27" r="20" fill="#f8d849"/><path d="M15-66H57 M36-87V-45" stroke="#242823" stroke-width="7" stroke-linecap="round"/>'
};
(async()=>{for(const [slug,figure] of Object.entries(figures)){
 const id='module-'+slug;const wrap=(width,height,scale)=>`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="24" fill="${slug==='math-between-grade7'?'#e6edf5':'#e7efe8'}"/><circle cx="${width*.79}" cy="${height*.24}" r="${height*.12}" fill="#fff5c7"/><g transform="translate(${width/2},${height/2}) scale(${scale})">${figure}</g></svg>`;
 const dir=path.join(root,'miniprogram/assets/generated');fs.mkdirSync(dir,{recursive:true});
 const original=Buffer.from(wrap(1536,864,2));const source=path.join(root,'output/imagegen/ui-v2');fs.mkdirSync(source,{recursive:true});
 fs.writeFileSync(path.join(source,id+'.svg'),original);await sharp(original).png().toFile(path.join(source,id+'.png'));
 await sharp(original).resize(768,432).webp({quality:88}).toFile(path.join(dir,id+'-landscape.webp'));
 await sharp(Buffer.from(wrap(384,384,1))).resize(192,192).webp({quality:88}).toFile(path.join(dir,id+'-icon.webp'));
 console.log('Prepared',slug);
}})().catch(error=>{console.error(error.message);process.exitCode=1;});
