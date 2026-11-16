// 发布包已包含构建后的网页。托管平台运行此文件检查目录完整性，无需安装依赖。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const dist=path.join(here,'dist');

const uploadChunks = [{"name": "site-data-01.json.gz", "sha256": "b3054ce45e45efbca779b96d17d747550f96eae9c11af90087d494396ec9442d"}, {"name": "site-data-02.json.gz", "sha256": "ef019fb947276fbd6c2a1b4d3beb0a6de1a8d3f7ebc97c26d9fa6fd1745c9c2b"}, {"name": "site-data-03.json.gz", "sha256": "a43e015c273fecc7a9397b71dd0d36c90bb82b7e0ffbc0de300c9bbb199e14ea"}, {"name": "site-data-04.json.gz", "sha256": "1f9cd0bea25834cdc8e60fe7123eb1d6036ff2bf0d14e472285434b407d5f4df"}];
const restoredPaths = new Set();
for (const part of uploadChunks) {
 const compressed = fs.readFileSync(new URL(part.name, import.meta.url));
 assert.equal(createHash('sha256').update(compressed).digest('hex'), part.sha256, '上传文件损坏：'+part.name);
 const records = JSON.parse(gunzipSync(compressed, {maxOutputLength:64*1024*1024}).toString('utf8'));
 for (const record of records) {
  assert.equal(typeof record.path, 'string');
  assert.equal(typeof record.data, 'string');
  assert.ok(!record.path.includes('\\')&&!record.path.includes('\0')&&!path.posix.isAbsolute(record.path)&&!record.path.split('/').some(p=>p==='..'||p==='.'||p===''), '文件路径非法');
  assert.ok(!restoredPaths.has(record.path), '重复文件');
  restoredPaths.add(record.path);
  const target = path.resolve(dist, record.path);
  const relative = path.relative(dist, target);
  assert.ok(relative!==''&&!relative.startsWith('..')&&!path.isAbsolute(relative), '文件越界');
  fs.mkdirSync(path.dirname(target), {recursive:true});
  fs.writeFileSync(target, Buffer.from(record.data, 'base64'));
 }
}
console.log('已还原 '+restoredPaths.size+' 个网站文件。');

const app=path.join(dist,'课程工作台');
let checked=0;
function exists(file){
 const rel=path.relative(dist,file);
 assert.ok(rel!==''&&!rel.startsWith('..')&&!path.isAbsolute(rel),'资源必须位于发布目录内：'+file);
 assert.ok(fs.existsSync(file)&&fs.statSync(file).isFile(),'缺少静态资源：'+rel);
 checked++;
}
exists(path.join(dist,'index.html'));
const html=fs.readFileSync(path.join(app,'index.html'),'utf8');
assert.ok(!html.includes('COURSE_RELAY_URL'),'静态页面不应启用服务端转发');
for(const [,ref] of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 if(ref.startsWith('#'))continue;
 assert.ok(!/^(?:https?:)?\/\//.test(ref),'页面资源不应依赖外部 CDN：'+ref);
 exists(path.resolve(app,decodeURIComponent(ref.split('?')[0])));
}
const katexCss=path.join(app,'assets/katex/katex.min.css');
for(const [,ref] of fs.readFileSync(katexCss,'utf8').matchAll(/url\(([^)]+)\)/g)){
 exists(path.resolve(path.dirname(katexCss),ref.replace(/^['"]|['"]$/g,'')));
}
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(app,'assets/course-data.js'),'utf8'),context);
const data=context.window.COURSE_DATA;
assert.ok(data.chapters.length&&data.questions.length,'题库数据为空');
for(const q of data.questions){
 for(const f of q.stem_figures||[])exists(path.join(app,'assets/figures',f.path));
 for(const s of q.subs){
  if(s.figure)exists(path.join(app,'assets/figures',s.figure.path));
  for(const f of s.code_files||[])exists(path.join(app,'assets/code',f.path));
 }
}
for(const name of ['1-最优化导论  第4版.pdf','1-最优化导论  第4版-识别结果.md'])exists(path.join(dist,'教材',name));
console.log(`发布检查通过：${data.chapters.length} 章，${data.questions.length} 题，${data.questions.reduce((n,q)=>n+q.subs.length,0)} 个解答单元；检查 ${checked} 处资源引用。`);
