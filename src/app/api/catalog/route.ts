import { pool } from '@/lib/db';
import { endpoint } from '@/lib/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return endpoint(async () => {
    const [plastik, methods, products, suppliers, customers] = await Promise.all([
      pool.query('SELECT * FROM plastik ORDER BY plastik_name'),
      pool.query('SELECT * FROM metode_bayar ORDER BY method_id'),
      pool.query(`SELECT p.product_id, p.product_name, p.price_product, p.stok, b.brand_name
        FROM product p JOIN brand b USING(brand_id) ORDER BY p.product_name`),
      pool.query('SELECT supplier_id,supplier_name FROM supplier ORDER BY supplier_name'),
      pool.query(`SELECT DISTINCT customer_name FROM transaksi WHERE type='Jual Minuman'
        AND customer_name IS NOT NULL ORDER BY customer_name`)
    ]);
    return {plastik:plastik.rows, methods:methods.rows, products:products.rows,
      suppliers:suppliers.rows, customers:customers.rows.map(row=>row.customer_name)};
  });
}
