import { pool } from '@/lib/db';
import { endpoint } from '@/lib/http';
import { id } from '@/lib/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(_request:Request,context:{params:Promise<{id:string}>}){
  return endpoint(async()=>{
    const plastikId=id.parse(Number((await context.params).id));
    const {rows}=await pool.query(`SELECT t.transaksi_id,to_char(t.transaction_date,'YYYY-MM-DD') AS date,
      COALESCE(s.supplier_name,'Tidak tercatat') AS supplier,d.berat_diterima::text AS quantity,
      d.harga_satuan::text AS unit_price,d.subtotal::text AS subtotal
      FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id)
      LEFT JOIN supplier s USING(supplier_id)
      WHERE d.plastik_id=$1 AND t.type='Beli Plastik' AND t.status='Selesai'
      ORDER BY t.transaction_date DESC,t.transaksi_id DESC`,[plastikId]);
    return rows;
  });
}
