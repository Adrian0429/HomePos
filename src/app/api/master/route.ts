import { z } from 'zod';
import { atomic, pool } from '@/lib/db';
import { endpoint } from '@/lib/http';
import { BusinessError, id } from '@/lib/validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const decimal = (scale:number) => z.string().regex(new RegExp(`^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,${scale}})?$`), 'Nilai harus positif atau nol, dengan desimal sesuai satuan');
const item = z.discriminatedUnion('kind', [
  z.object({kind:z.literal('product'),name:z.string().trim().min(1).max(160),brandName:z.string().trim().min(1).max(120),cost:decimal(2),stock:z.number().int().min(0).max(2147483647)}),
  z.object({kind:z.literal('plastik'),name:z.string().trim().min(1).max(120),stock:decimal(2)})
]);
const edit = z.object({id,version:z.string().regex(/^\d+$/),item});
const remove = z.object({kind:z.enum(['product','plastik']),id,version:z.string().regex(/^\d+$/)});
export async function GET() {
  return endpoint(async () => {
    const [products,plastik,brands] = await Promise.all([
      pool.query(`SELECT p.product_id,p.product_name,p.brand_id,p.price_product,p.stok,p.xmin::text AS version,b.brand_name
        FROM product p JOIN brand b USING(brand_id) ORDER BY p.product_name, p.product_id`),
      pool.query('SELECT *, xmin::text AS version FROM plastik ORDER BY plastik_name'),
      pool.query('SELECT * FROM brand ORDER BY brand_name')
    ]);
    return {products:products.rows,plastik:plastik.rows,brands:brands.rows};
  });
}
async function save(data:z.infer<typeof item>, existing?:{id:number;version:string}) {
  try {
    return await atomic(async db => {
      let brandId:number|undefined;
      if(data.kind==='product') {
        // Merek baru dapat dibuat langsung dari form produk, dalam transaksi yang sama.
        const brand=await db.query(`INSERT INTO brand(brand_name) VALUES($1)
          ON CONFLICT(brand_name) DO UPDATE SET brand_name=EXCLUDED.brand_name RETURNING brand_id`,[data.brandName]);
        brandId=brand.rows[0].brand_id;
      }
      const result = data.kind==='product'
        ? existing
          ? await db.query(`UPDATE product SET product_name=$1,brand_id=$2,price_product=$3,stok=$4
              WHERE product_id=$5 AND xmin::text=$6 RETURNING *, xmin::text AS version`,[data.name,brandId,data.cost,data.stock,existing.id,existing.version])
          : await db.query(`INSERT INTO product(product_name,brand_id,price_product,sell_price,stok) VALUES($1,$2,$3,0,$4) RETURNING *, xmin::text AS version`,[data.name,brandId,data.cost,data.stock])
        : existing
          ? await db.query(`UPDATE plastik SET plastik_name=$1,stok=$2 WHERE plastik_id=$3 AND xmin::text=$4 RETURNING *, xmin::text AS version`,[data.name,data.stock,existing.id,existing.version])
          : await db.query(`INSERT INTO plastik(plastik_name,stok) VALUES($1,$2) RETURNING *, xmin::text AS version`,[data.name,data.stock]);
      // Optimistic lock juga menangkap perubahan stok oleh POS atau gudang.
      if(!result.rowCount) throw new BusinessError('Data telah berubah atau tidak ditemukan. Muat ulang daftar lalu buka Edit kembali.');
      return result.rows[0];
    });
  } catch(error) {
    if((error as {code?:string}).code==='23505') throw new BusinessError('Nama plastik sudah digunakan. Pilih nama lain.',409);
    throw error;
  }
}
export async function POST(request:Request) {
  return endpoint(async()=>save(item.parse(await request.json())),201);
}
export async function PATCH(request:Request) {
  return endpoint(async()=>{const data=edit.parse(await request.json());return save(data.item,data);});
}
export async function DELETE(request:Request) {
  return endpoint(async()=>{
    const data=remove.parse(await request.json());
    return atomic(async db=>{
      if(data.kind==='product') {
        const current=await db.query('SELECT brand_id FROM product WHERE product_id=$1 AND xmin::text=$2 FOR UPDATE',[data.id,data.version]);
        if(!current.rowCount) throw new BusinessError('Data telah berubah atau tidak ditemukan. Muat ulang daftar.',409);
        const used=await db.query('SELECT 1 FROM detail_transaksi_product WHERE product_id=$1 LIMIT 1',[data.id]);
        if(used.rowCount) throw new BusinessError('Produk sudah tercatat dalam transaksi dan tidak dapat dihapus.',409);
        const deleted=await db.query('DELETE FROM product WHERE product_id=$1 AND xmin::text=$2',[data.id,data.version]);
        if(!deleted.rowCount) throw new BusinessError('Data berubah saat dihapus. Muat ulang daftar.',409);
        await db.query('DELETE FROM brand b WHERE b.brand_id=$1 AND NOT EXISTS(SELECT 1 FROM product p WHERE p.brand_id=b.brand_id)',[current.rows[0].brand_id]);
      } else {
        const current=await db.query('SELECT 1 FROM plastik WHERE plastik_id=$1 AND xmin::text=$2 FOR UPDATE',[data.id,data.version]);
        if(!current.rowCount) throw new BusinessError('Data telah berubah atau tidak ditemukan. Muat ulang daftar.',409);
        const used=await db.query('SELECT 1 FROM detail_transaksi_plastik WHERE plastik_id=$1 LIMIT 1',[data.id]);
        if(used.rowCount) throw new BusinessError('Plastik sudah tercatat dalam transaksi dan tidak dapat dihapus.',409);
        const deleted=await db.query('DELETE FROM plastik WHERE plastik_id=$1 AND xmin::text=$2',[data.id,data.version]);
        if(!deleted.rowCount) throw new BusinessError('Data berubah saat dihapus. Muat ulang daftar.',409);
      }
      return {deleted:true};
    });
  });
}
