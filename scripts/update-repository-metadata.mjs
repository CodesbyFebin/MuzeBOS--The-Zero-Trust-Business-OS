/** Apply reviewed About/topics with the operator's authenticated GitHub CLI. No tokens in source. */
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(readFileSync(new URL('../config/repository.json',import.meta.url),'utf8'));
const mutations=[['PATCH',`repos/${config.repository}`,{description:config.description}],['PUT',`repos/${config.repository}/topics`,{names:config.topics}]];
if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'preview',...config},null,2));process.exit(0);}
for(const [method,endpoint,data] of mutations){const r=spawnSync('gh',['api','--method',method,endpoint,'--input','-'],{input:JSON.stringify(data),encoding:'utf8'});if(r.error||r.status!==0){console.error(r.error?.message||r.stderr);process.exit(1);}console.log(`${method} ${endpoint}: updated`);}
