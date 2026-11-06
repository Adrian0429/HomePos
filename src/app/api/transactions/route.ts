import { endpoint } from '@/lib/http';
import { createInput } from '@/lib/validation';
import { createTransaction } from '@/lib/transactions';
import { pool } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  return endpoint(async () => createTransaction(createInput.parse(await request.json())), 201);
}
export async function GET() {
  return endpoint(async () => (await pool.query(`SELECT t.*, COALESCE(json_agg(d ORDER BY d.detail_transaksi_plastik_id)
    FILTER (WHERE d.detail_transaksi_plastik_id IS NOT NULL), '[]') AS items
    FROM transaksi t LEFT JOIN detail_transaksi_plastik d USING(transaksi_id)
    WHERE t.status='Menunggu Pabrik' AND t.type='Kirim Pabrik'
    GROUP BY t.transaksi_id ORDER BY t.transaksi_id DESC LIMIT 100`)).rows);
}
