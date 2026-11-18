import { z } from 'zod';
import { atomic } from '@/lib/db';
import { endpoint } from '@/lib/http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const filter=z.object({from:z.iso.date(),to:z.iso.date(),page:z.coerce.number().int().min(1).max(100000).default(1),category:z.enum(['minuman','plastik']).default('minuman'),supplierId:z.coerce.number().int().positive().optional(),buyerName:z.string().trim().max(160).optional()})
  .refine(v=>v.from<=v.to,'Tanggal awal harus sebelum atau sama dengan tanggal akhir');
const pageSize=50;
const goodsInCte=`WITH goods_in AS (
  SELECT t.transaksi_id,to_char(t.transaction_date,'YYYY-MM-DD') AS date,'Minuman'::text AS category,
    p.product_name AS product,'unit'::text AS unit,'—'::text AS party,NULL::int AS supplier_id,d.jumlah::numeric AS quantity,
    d.harga_satuan::numeric AS unit_price,d.subtotal::numeric AS subtotal
  FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id) JOIN product p USING(product_id)
  WHERE t.status='Selesai' AND t.type='Restok Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
  UNION ALL
  SELECT t.transaksi_id,to_char(t.transaction_date,'YYYY-MM-DD'),'Plastik',p.plastik_name,'kg',
    COALESCE(s.supplier_name,'—'),s.supplier_id,d.berat_diterima,d.harga_satuan,d.subtotal
  FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
  LEFT JOIN supplier s USING(supplier_id)
  WHERE t.status='Selesai' AND t.type='Beli Plastik' AND t.transaction_date BETWEEN $1::date AND $2::date
) `;

export async function GET(request:Request){
  return endpoint(async()=>{
    const f=filter.parse(Object.fromEntries(new URL(request.url).searchParams));
    return atomic(async db=>{
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const args=[f.from,f.to];
      const offset=(f.page-1)*pageSize;
      const supplierId=f.supplierId??null;
      const buyerName=f.category==='minuman'?(f.buyerName||null):null;
      const supplierArgs=[...args,f.category,supplierId];

      const [salesByProduct,salesProductCount,salesByBuyer,salesBuyerCount,salesTotals,plasticByProduct,plasticProductCount,plasticParties,plasticPartyCount,plasticTotals,goodsIn,goodsInCount,goodsInTotals,transactions,transactionCount,transactionTotals,suppliers,buyers]=await Promise.all([
        db.query(`SELECT p.product_id,p.product_name AS product,b.brand_name AS brand,SUM(d.jumlah)::text AS quantity,
          SUM(d.subtotal)::text AS total,COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id) JOIN product p USING(product_id)
          JOIN brand b USING(brand_id)
          WHERE t.status='Selesai' AND t.type='Jual Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$3)
          GROUP BY p.product_id,p.product_name,b.brand_name ORDER BY p.product_name LIMIT $4 OFFSET $5`,[...args,buyerName,pageSize,offset]),
        db.query(`SELECT COUNT(*)::int AS count FROM product p WHERE EXISTS(
          SELECT 1 FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id)
          WHERE d.product_id=p.product_id AND t.status='Selesai' AND t.type='Jual Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$3))`,[...args,buyerName]),
        db.query(`SELECT COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum') AS "customerName",
          SUM(d.jumlah)::text AS quantity,SUM(d.subtotal)::text AS total,COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id)
          WHERE t.status='Selesai' AND t.type='Jual Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$3)
          GROUP BY COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum') ORDER BY SUM(d.subtotal) DESC,"customerName"
          LIMIT $4 OFFSET $5`,[...args,buyerName,pageSize,offset]),
        db.query(`SELECT COUNT(*)::int AS count FROM (
          SELECT COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')
          FROM transaksi t WHERE t.status='Selesai' AND t.type='Jual Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$3)
          GROUP BY COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')) buyers`,[...args,buyerName]),
        db.query(`SELECT COALESCE(SUM(d.jumlah),0)::text AS quantity,COALESCE(SUM(d.subtotal),0)::text AS total,
          COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_product d JOIN transaksi t USING(transaksi_id)
          WHERE t.status='Selesai' AND t.type='Jual Minuman' AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::text IS NULL OR COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$3)`,[...args,buyerName]),
        db.query(`SELECT p.plastik_id,p.plastik_name AS product,
          COALESCE(SUM(d.berat_diterima) FILTER(WHERE t.type='Beli Plastik'),0)::text AS masuk,
          COALESCE(SUM(d.berat_kirim) FILTER(WHERE t.type='Kirim Pabrik'),0)::text AS dikirim,
          COALESCE(SUM(d.berat_diterima) FILTER(WHERE t.type='Kirim Pabrik' AND t.status='Selesai'),0)::text AS diterima,
          COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
          WHERE t.status<>'Batal' AND t.type IN ('Beli Plastik','Kirim Pabrik') AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$3))
          GROUP BY p.plastik_id,p.plastik_name ORDER BY p.plastik_name LIMIT $4 OFFSET $5`,[...args,supplierId,pageSize,offset]),
        db.query(`SELECT COUNT(*)::int AS count FROM (
          SELECT p.plastik_id FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
          WHERE t.status<>'Batal' AND t.type IN ('Beli Plastik','Kirim Pabrik') AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$3))
          GROUP BY p.plastik_id) items`,[...args,supplierId]),
        db.query(`SELECT to_char(t.transaction_date,'YYYY-MM-DD') AS date,p.plastik_name AS product,
          CASE WHEN t.type='Beli Plastik' THEN 'Barang masuk' ELSE 'Kirim ke pabrik' END AS movement,
          COALESCE(s.supplier_name,'Pabrik') AS party,t.status::text AS status,
          SUM(CASE WHEN t.type='Beli Plastik' THEN d.berat_diterima ELSE d.berat_kirim END)::text AS quantity,
          SUM(CASE WHEN t.type='Kirim Pabrik' THEN d.berat_diterima ELSE 0 END)::text AS diterima,
          COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
          LEFT JOIN supplier s USING(supplier_id)
          WHERE t.status<>'Batal' AND t.type IN ('Beli Plastik','Kirim Pabrik') AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$3))
          GROUP BY t.transaction_date,p.plastik_id,p.plastik_name,t.type,t.status,COALESCE(s.supplier_name,'Pabrik')
          ORDER BY t.transaction_date DESC,p.plastik_name,movement,party LIMIT $4 OFFSET $5`,[...args,supplierId,pageSize,offset]),
        db.query(`SELECT COUNT(*)::int AS count FROM (
          SELECT t.transaction_date,p.plastik_id,t.type,t.status,COALESCE(s.supplier_name,'Pabrik')
          FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id) JOIN plastik p USING(plastik_id)
          LEFT JOIN supplier s USING(supplier_id)
          WHERE t.status<>'Batal' AND t.type IN ('Beli Plastik','Kirim Pabrik') AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$3))
          GROUP BY t.transaction_date,p.plastik_id,t.type,t.status,COALESCE(s.supplier_name,'Pabrik')) movements`,[...args,supplierId]),
        db.query(`SELECT
          COALESCE(SUM(d.berat_diterima) FILTER(WHERE t.type='Beli Plastik'),0)::text AS masuk,
          COALESCE(SUM(d.berat_kirim) FILTER(WHERE t.type='Kirim Pabrik'),0)::text AS dikirim,
          COALESCE(SUM(d.berat_diterima) FILTER(WHERE t.type='Kirim Pabrik' AND t.status='Selesai'),0)::text AS diterima,
          COUNT(DISTINCT t.transaksi_id)::int AS notes
          FROM detail_transaksi_plastik d JOIN transaksi t USING(transaksi_id)
          WHERE t.status<>'Batal' AND t.type IN ('Beli Plastik','Kirim Pabrik') AND t.transaction_date BETWEEN $1::date AND $2::date
            AND ($3::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$3))`,[...args,supplierId]),
        db.query(goodsInCte+`SELECT transaksi_id,date,category,product,unit,party,quantity::text,unit_price::text AS "unitPrice",subtotal::text
          FROM goods_in WHERE category=CASE WHEN $3='minuman' THEN 'Minuman' ELSE 'Plastik' END
            AND ($4::int IS NULL OR supplier_id=$4)
          ORDER BY date DESC,product,transaksi_id DESC LIMIT $5 OFFSET $6`,[...supplierArgs,pageSize,offset]),
        db.query(goodsInCte+`SELECT COUNT(*)::int AS count FROM goods_in WHERE category=CASE WHEN $3='minuman' THEN 'Minuman' ELSE 'Plastik' END AND ($4::int IS NULL OR supplier_id=$4)`,supplierArgs),
        db.query(goodsInCte+`SELECT COALESCE(SUM(quantity),0)::text AS quantity,COALESCE(SUM(subtotal),0)::text AS total,
          COUNT(DISTINCT transaksi_id)::int AS notes FROM goods_in
          WHERE category=CASE WHEN $3='minuman' THEN 'Minuman' ELSE 'Plastik' END AND ($4::int IS NULL OR supplier_id=$4)`,supplierArgs),
        db.query(`SELECT t.transaksi_id,to_char(t.transaction_date,'YYYY-MM-DD') AS date,
          to_char(t.selesai_date,'YYYY-MM-DD') AS "noteDate",t.type::text AS event,t.status::text,
          t.customer_name AS "customerName",s.supplier_name AS "supplierName",COALESCE(m.payment_method,'—') AS method,
          CASE WHEN t.status='Selesai' AND (t.type='Jual Minuman' OR t.type='Kirim Pabrik') THEN t.total_nominal ELSE 0 END::text AS masuk,
          CASE WHEN t.status='Selesai' AND t.type IN ('Beli Plastik','Restok Minuman') THEN t.total_nominal ELSE 0 END::text AS keluar,
          t.total_nominal::text AS total
          FROM transaksi t LEFT JOIN supplier s USING(supplier_id) LEFT JOIN metode_bayar m USING(method_id)
          WHERE (t.transaction_date BETWEEN $1::date AND $2::date
            OR (t.type='Kirim Pabrik' AND t.selesai_date BETWEEN $1::date AND $2::date))
          AND (($3='minuman' AND t.type IN ('Jual Minuman','Restok Minuman')) OR ($3='plastik' AND t.type IN ('Beli Plastik','Kirim Pabrik')))
          AND ($4::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$4))
          AND ($5::text IS NULL OR (t.type='Jual Minuman' AND COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$5))
          ORDER BY GREATEST(t.transaction_date,COALESCE(t.selesai_date,t.transaction_date)) DESC,t.transaksi_id DESC
          LIMIT $6 OFFSET $7`,[...args,f.category,supplierId,buyerName,pageSize,offset]),
        db.query(`SELECT COUNT(*)::int AS count FROM transaksi t
          WHERE (t.transaction_date BETWEEN $1::date AND $2::date
            OR (t.type='Kirim Pabrik' AND t.selesai_date BETWEEN $1::date AND $2::date))
            AND (($3='minuman' AND t.type IN ('Jual Minuman','Restok Minuman')) OR ($3='plastik' AND t.type IN ('Beli Plastik','Kirim Pabrik')))
            AND ($4::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$4))
            AND ($5::text IS NULL OR (t.type='Jual Minuman' AND COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$5))`,[...args,f.category,supplierId,buyerName]),
        db.query(`SELECT
          COALESCE(SUM(CASE WHEN t.status='Selesai' AND (t.type='Jual Minuman' OR t.type='Kirim Pabrik') THEN t.total_nominal ELSE 0 END),0)::text AS masuk,
          COALESCE(SUM(CASE WHEN t.status='Selesai' AND t.type IN ('Beli Plastik','Restok Minuman') THEN t.total_nominal ELSE 0 END),0)::text AS keluar,
          COALESCE(SUM(CASE WHEN t.status<>'Batal' THEN t.total_nominal ELSE 0 END),0)::text AS total,
          COUNT(*)::int AS notes
          FROM transaksi t
          WHERE (t.transaction_date BETWEEN $1::date AND $2::date
            OR (t.type='Kirim Pabrik' AND t.selesai_date BETWEEN $1::date AND $2::date))
            AND (($3='minuman' AND t.type IN ('Jual Minuman','Restok Minuman')) OR ($3='plastik' AND t.type IN ('Beli Plastik','Kirim Pabrik')))
            AND ($4::int IS NULL OR (t.type='Beli Plastik' AND t.supplier_id=$4))
            AND ($5::text IS NULL OR (t.type='Jual Minuman' AND COALESCE(NULLIF(BTRIM(t.customer_name),''),'Umum')=$5))`,[...args,f.category,supplierId,buyerName]),
        db.query(`SELECT supplier_id,supplier_name FROM supplier ORDER BY supplier_name`),
        db.query(`SELECT DISTINCT COALESCE(NULLIF(BTRIM(customer_name),''),'Umum') AS customer_name
          FROM transaksi WHERE type='Jual Minuman' ORDER BY customer_name`),
      ]);
      return {from:f.from,to:f.to,page:f.page,pageSize,
        category:f.category,supplierId:f.supplierId??null,buyerName,suppliers:suppliers.rows,buyers:buyers.rows,
        counts:{salesProduct:salesProductCount.rows[0].count,salesBuyer:salesBuyerCount.rows[0].count,
          plasticProduct:plasticProductCount.rows[0].count,plasticParty:plasticPartyCount.rows[0].count,
          goodsIn:goodsInCount.rows[0].count,transactions:transactionCount.rows[0].count},
        totals:{sales:salesTotals.rows[0],plastic:plasticTotals.rows[0],goodsIn:goodsInTotals.rows[0],transactions:transactionTotals.rows[0]},
        salesByProduct:salesByProduct.rows,salesByBuyer:salesByBuyer.rows,plasticByProduct:plasticByProduct.rows,
        plasticParties:plasticParties.rows,goodsIn:goodsIn.rows,transactions:transactions.rows};
    });
  });
}
