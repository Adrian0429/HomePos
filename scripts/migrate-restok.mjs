import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
nextEnv.loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await db.connect();
  for (const file of ['001-restok-minuman.sql','002-pembeli-pos.sql','003-supplier-plastik.sql']) {
    await db.query(await readFile(new URL(`../db/migrations/${file}`,import.meta.url),'utf8'));
  }
  console.log('Migrasi HomePOS berhasil.');
}
finally{await db.end();}
