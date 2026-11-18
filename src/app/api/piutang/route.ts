import { pool } from '@/lib/db';
import { endpoint } from '@/lib/http';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  return endpoint(async()=>{
    const [debts,stock]=await Promise.all([
      pool.query(`SELECT t.transaksi_id,t.transaction_date,t.debt_due_date,t.debt_kind,t.customer_name,
        t.total_nominal::text,t.debt_paid::text,
        COALESCE(json_agg(json_build_object('name',p.product_name,'brand',b.brand_name,'quantity',d.jumlah,
          'unitPrice',d.harga_satuan::text,'subtotal',d.subtotal::text) ORDER BY p.product_name)
          FILTER(WHERE d.detail_transaksi_product_id IS NOT NULL),'[]') AS items
        FROM transaksi t LEFT JOIN detail_transaksi_product d USING(transaksi_id)
        LEFT JOIN product p USING(product_id) LEFT JOIN brand b USING(brand_id)
        WHERE t.debt_kind IS NOT NULL AND t.total_nominal>t.debt_paid
        GROUP BY t.transaksi_id ORDER BY t.debt_due_date,t.transaksi_id`),
      pool.query(`SELECT p.product_id,p.product_name,b.brand_name,p.stok,
        COALESCE(SUM(l.remaining_quantity) FILTER(WHERE t.debt_kind IS NOT NULL AND t.total_nominal>t.debt_paid),0)::int AS debt_stock
        FROM product p JOIN brand b USING(brand_id)
        LEFT JOIN product_stock_lot l USING(product_id)
        LEFT JOIN transaksi t ON t.transaksi_id=l.restock_transaction_id
        GROUP BY p.product_id,b.brand_name ORDER BY p.product_name`)
    ]);
    const products=stock.rows.map(row=>({...row,non_debt_stock:Math.max(0,Number(row.stok)-Number(row.debt_stock))}));
    const totals=products.reduce((sum,row)=>({total:sum.total+Number(row.stok),debt:sum.debt+Number(row.debt_stock),nonDebt:sum.nonDebt+Number(row.non_debt_stock)}),{total:0,debt:0,nonDebt:0});
    return {debts:debts.rows,products,stockTotals:totals};
  });
}
