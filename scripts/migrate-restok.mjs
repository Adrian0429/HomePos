import nextEnv from '@next/env';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
nextEnv.loadEnvConfig(process.cwd());
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diisi');
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
try {
  await db.connect();
  for (const file of ['001-restok-minuman.sql','002-pembeli-pos.sql','003-supplier-plastik.sql','004-auth.sql']) {
    await db.query(await readFile(new URL(`../db/migrations/${file}`,import.meta.url),'utf8'));
  }
  const { randomBytes, scryptSync } = await import('node:crypto');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync('Admin123', salt, 64).toString('hex');
  await db.query(`INSERT INTO app_user(username,password_salt,password_hash) VALUES('Admin',$1,$2)
    ON CONFLICT(username) DO UPDATE SET password_salt=EXCLUDED.password_salt,password_hash=EXCLUDED.password_hash`, [salt,hash]);
  console.log('Migrasi HomePOS berhasil.');
}
finally{await db.end();}
