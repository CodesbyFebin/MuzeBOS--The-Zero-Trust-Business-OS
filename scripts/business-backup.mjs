import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
const destination=process.argv[2];
if(!destination) throw new Error('Usage: node scripts/business-backup.mjs /absolute/path/to/backup.sqlite');
const source=path.resolve(process.env.MUZEBOS_DB || 'data/muzebos-business.db');
const target=path.resolve(destination);
if(source===target || fs.existsSync(target)) throw new Error('Choose a new backup path, different from the source');
const db=new Database(source,{readonly:true,fileMustExist:true});
try { await db.backup(target);console.log('Commerce backup completed'); } finally {db.close();}
