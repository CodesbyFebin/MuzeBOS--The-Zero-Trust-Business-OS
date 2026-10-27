import {describe,it,expect} from 'vitest';
import {readFileSync,existsSync,mkdtempSync,readdirSync,statSync,rmSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {build,PAGES,BASE,ROOT,markdown} from '../scripts/build-project-site.mjs';
import nextConfig from '../next.config.mjs';
const read=(p:string)=>readFileSync(path.join(ROOT,p),'utf8');
const all=(dir:string):string[]=>readdirSync(dir).flatMap(n=>statSync(path.join(dir,n)).isDirectory()?all(path.join(dir,n)):[path.join(dir,n)]);
describe('public project documentation and private workspace separation',()=>{
 it('builds exactly seven distinct canonical pages, matching schema and sitemap with no private URLs',()=>{
  const urls=new Set<string>(),titles=new Set<string>(),descriptions=new Set<string>();const sitemap=read('site/sitemap.xml');
  for(const p of PAGES){const html=read('site/'+p.slug+'index.html');expect(html.match(/<h1>/g)?.length).toBe(1);expect(html).toContain('lang="en"');expect(html).toContain(`rel="canonical" href="${BASE+p.slug}"`);expect(html).toContain('href="#main"');expect(html).not.toContain('name="robots" content="noindex');
   const json=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1]);expect(json.url).toBe(BASE+p.slug);expect(json['@type']).toBe(p.slug?'TechArticle':'SoftwareSourceCode');expect(JSON.stringify(json)).not.toMatch(/aggregateRating|reviewCount|offers/);
   expect(sitemap).toContain('<loc>'+BASE+p.slug+'</loc>');urls.add(json.url);titles.add(p.title);descriptions.add(p.description);
  }expect(urls.size).toBe(7);expect(titles.size).toBe(7);expect(descriptions.size).toBe(7);expect(sitemap.match(/<loc>/g)?.length).toBe(7);expect(sitemap).not.toMatch(/\/workspace\/|\/api\/|\/business|\/account/);
 });
 it('all public-document internal links resolve to generated pages or real source files',()=>{
  for(const f of all(path.join(ROOT,'site')).filter(p=>p.endsWith('.html'))){const html=readFileSync(f,'utf8');for(const [,href]of html.matchAll(/href="([^"]+)"/g)){
   if(href.startsWith(BASE)){const rel=href.slice(BASE.length);expect(existsSync(path.join(ROOT,'site',rel,rel.endsWith('/')||!rel?'index.html':'')),href).toBe(true);}
   else if(href.startsWith('https://github.com/CodesbyFebin/MuzeBOS--The-Zero-Trust-Business-OS/blob/main/'))expect(existsSync(path.join(ROOT,href.split('/blob/main/')[1])),href).toBe(true);
  }}
 });
 it('committed export matches a clean deterministic build',()=>{const dir=mkdtempSync(path.join(tmpdir(),'muzebos-docs-'));try{expect(build(dir)).toBe(7);const files=all(dir);for(const f of files)expect(readFileSync(f,'utf8')).toBe(read('site/'+path.relative(dir,f)));expect(files.length).toBe(all(path.join(ROOT,'site')).length);}finally{rmSync(dir,{recursive:true,force:true});}});
 it('escapes source markup and does not read operational data',()=>{expect(markdown('# <script>alert(1)</script>','README.md')).not.toContain('<script>');const generator=read('scripts/build-project-site.mjs');expect(generator).not.toMatch(/getDb|businessStore|\.env\.local|process\.env/);});
 it('private app defaults to noindex without changing the access boundary',async()=>{expect(read('app/layout.tsx')).toContain('robots: { index: false, follow: false, noarchive: true }');const headers=await nextConfig.headers!();expect(headers[0].headers).toContainEqual({key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'});expect(read('lib/auth-gate.ts')).not.toMatch(/docs\/search|site\//);});
 it('repository metadata is concise, factual and within GitHub topic limits',()=>{const c=JSON.parse(read('config/repository.json'));expect(c.description.length).toBeLessThanOrEqual(350);expect(c.topics.length).toBeLessThanOrEqual(20);for(const t of c.topics)expect(t).toMatch(/^[a-z0-9-]{1,50}$/);expect(c.description).not.toMatch(/100\/100|production.ready|certified|fully verified/i);});
});
