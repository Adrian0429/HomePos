import { z } from 'zod';
import { atomic } from '@/lib/db';
import { endpoint } from '@/lib/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const filter=z.object({from:z.iso.date(),to:z.iso.date(),page:z.coerce.number().int().min(1).max(100000).default(1)})
  .refine(v=>v.from<=v.to,'Tanggal awal harus sebelum atau sama dengan tanggal akhir');
export async function GET(request:Request){
  return endpoint(async()=>{
    const f=filter.parse(Object.fromEntries(new URL(request.url).searchParams));
    return atomic(async db=>{
      // Satu snapshot agar ringkasan dan rincian konsisten saat kasir masih aktif.
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const args=[f.from,f.to];
      const cash=await db.query(`SELECT COALESCE(m.payment_method,'Belum ditentukan') AS method,
        COALESCE(SUM(t.total_nominal) FILTER(WHERE t.type IN ('Jual Minuman','Kirim Pabrik')),0)::text AS masuk,
        COALESCE(SUM(t.total_nominal) FILTER(WHERE t.type IN ('Beli Plastik','Restok Minuman')),0)::text AS keluar
        FROM transaksi t LEFT JOIN metode_bayar m USING(method_id)
        WHERE t.status='Selesai'
        AND (CASE WHEN t.type='Kirim Pabrik' THEN t.selesai_date ELSE t.transaction_date END) BETWEEN $1::date AND $2::date GROUP BY m.payment_method ORDER BY method`,args);
      const goods=await db.query(`WITH movement AS (
        SELECT 'Minuman' AS category,p.product_id AS id,p.product_name AS name,'unit' AS unit,
          COALESCE(SUM(d.jumlah) FILTER(WHERE t.type='Restok Minuman'),0)::numeric AS masuk,
          COALESCE(SUM(d.jumlah) FILTER(WHERE t.type='Jual Minuman'),0)::numeric AS keluar
        FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id) JOIN product p USING(product_id)
        WHERE t.status='Selesai' AND t.type IN ('Jual Minuman','Restok Minuman') AND t.transaction_date BETWEEN $1::date AND $2::date
        GROUP BY p.product_id
        UNION ALL
        SELECT 'Plastik',p.plastik_id,p.plastik_name,'kg',
          COALESCE(SUM(d.berat_diterima) FILTER(WHERE t.type='Beli Plastik'),0),
          COALESCE(SUM(d.berat_kirim) FILTER(WHERE t.type='Kirim Pabrik'),0)
        FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
        WHERE t.status<>'Batal' AND t.transaction_date BETWEEN $1::date AND $2::date GROUP BY p.plastik_id
      ) SELECT category,id,name,unit,masuk::text,keluar::text,(masuk-keluar)::text AS net FROM movement ORDER BY category,name`,args);
      const factory=await db.query(`SELECT
        (SELECT COUNT(*)::int FROM transaksi WHERE type='Kirim Pabrik' AND status='Menunggu Pabrik' AND transaction_date BETWEEN $1::date AND $2::date) AS pending,
        COUNT(*)::int AS notes,COALESCE(SUM(total_nominal),0)::text AS nominal
        FROM transaksi WHERE type='Kirim Pabrik' AND status='Selesai' AND selesai_date BETWEEN $1::date AND $2::date`,args);
      // Pengiriman dan penerimaan nota adalah dua kejadian berbeda, bukan dua arus stok.
      const events=`WITH events AS (
        SELECT transaksi_id,transaction_date AS date,type::text AS event,status::text,method_id,customer_name,supplier_id,
          CASE WHEN type='Jual Minuman' THEN total_nominal ELSE 0 END AS masuk,
          CASE WHEN type IN ('Beli Plastik','Restok Minuman') THEN total_nominal ELSE 0 END AS keluar,0::numeric AS nota
        FROM transaksi WHERE status<>'Batal'
        UNION ALL
        SELECT transaksi_id,selesai_date,'Nota Pabrik',status::text,method_id,NULL::varchar AS customer_name,supplier_id,total_nominal,0,total_nominal
        FROM transaksi WHERE type='Kirim Pabrik' AND status='Selesai'
      ) `;
      const count=await db.query(events+`SELECT COUNT(*)::int AS count FROM events WHERE date BETWEEN $1::date AND $2::date`,args);
      const rows=await db.query(events+`SELECT e.transaksi_id,to_char(e.date,'YYYY-MM-DD') AS date,e.event,e.status,e.customer_name AS "customerName",
        s.supplier_name AS "supplierName",COALESCE(m.payment_method,'—') AS method,e.masuk::text,e.keluar::text,e.nota::text
        FROM events e LEFT JOIN metode_bayar m USING(method_id) LEFT JOIN supplier s USING(supplier_id)
        WHERE date BETWEEN $1::date AND $2::date ORDER BY date DESC,transaksi_id DESC,event LIMIT 50 OFFSET $3`,[...args,(f.page-1)*50]);
      return {from:f.from,to:f.to,cash:cash.rows,goods:goods.rows,factory:factory.rows[0],events:rows.rows,count:count.rows[0].count,page:f.page,pageSize:50};
    });
  });
}
