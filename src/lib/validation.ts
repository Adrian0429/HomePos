import { z } from 'zod';
export const id = z.number().int().positive().max(2147483647);
const paymentId = z.number({error:'Pilih metode pembayaran terlebih dahulu'}).int('Metode pembayaran tidak valid').positive('Pilih metode pembayaran terlebih dahulu').max(2147483647);
// Desimal dikirim sebagai string agar tidak kehilangan presisi di JavaScript.
const decimal = (scale: number) => z.string().regex(new RegExp(`^(0|[1-9][0-9]{0,8})(\\.[0-9]{1,${scale}})?$`));
const weight = decimal(2);
const positiveWeight = weight.refine(v => Number(v) > 0, 'Berat harus positif');
const price = decimal(2);
const date = z.iso.date();
const lines = <T extends z.ZodType>(schema: T) => z.array(schema).min(1).max(100);
export const createInput = z.discriminatedUnion('type', [
  z.object({type: z.literal('Restok Minuman'), transactionDate: date,
    items: lines(z.object({productId: id, jumlah: z.number().int().positive().max(1000000), hargaSatuan: price}))}),
  z.object({type: z.literal('Jual Minuman'), transactionDate: date, methodId: paymentId.optional(), isDebt: z.boolean().optional(),
    customerName: z.string().trim().max(160).optional(),
    items: lines(z.object({productId: id, jumlah: z.number().int().positive().max(1000000), hargaSatuan: price}))})
    .superRefine((sale, ctx) => {
      if (sale.isDebt && !sale.customerName?.trim()) ctx.addIssue({code:'custom',path:['customerName'],message:'Nama pembeli wajib diisi untuk penjualan hutang'});
      if (!sale.isDebt && !sale.methodId) ctx.addIssue({code:'custom',path:['methodId'],message:'Pilih metode pembayaran terlebih dahulu'});
    }),
  z.object({type: z.literal('Beli Plastik'), transactionDate: date, methodId: paymentId,
    supplierName: z.string().trim().min(1,'Pilih atau isi nama supplier').max(160),
    items: lines(z.object({plastikId: id, berat: positiveWeight, hargaSatuan: price}))}),
  z.object({type: z.literal('Kirim Pabrik'), transactionDate: date,factoryName:z.string().trim().min(1,'Isi nama pabrik tujuan').max(160),
    items: lines(z.object({plastikId: id, beratKirim: positiveWeight}))})
]);
export const settleInput = z.object({methodId: paymentId, items: lines(z.object({
  detailId: id, beratDiterima: weight, hargaSatuan: price
}))});
export const debtPaymentInput = z.object({amount: z.string().regex(/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/).refine(value => Number(value)>0,'Nominal pembayaran harus lebih dari 0')});
const editSaleItems=lines(z.object({productId:id,jumlah:z.number().int().positive().max(1000000),hargaSatuan:price}));
const editPlasticPurchaseItems=lines(z.object({plastikId:id,berat:positiveWeight,hargaSatuan:price}));
const editShipmentItems=lines(z.object({plastikId:id,beratKirim:positiveWeight,beratDiterima:weight,hargaSatuan:price}));
export const editTransactionInput=z.discriminatedUnion('type',[
  z.object({type:z.literal('Jual Minuman'),methodId:paymentId.optional(),isDebt:z.boolean(),customerName:z.string().trim().max(160).optional(),items:editSaleItems})
    .superRefine((value,ctx)=>{if(value.isDebt&&!value.customerName?.trim())ctx.addIssue({code:'custom',path:['customerName'],message:'Nama pembeli wajib diisi untuk penjualan hutang'});if(!value.isDebt&&!value.methodId)ctx.addIssue({code:'custom',path:['methodId'],message:'Pilih metode pembayaran terlebih dahulu'});}),
  z.object({type:z.literal('Restok Minuman'),items:editSaleItems}),
  z.object({type:z.literal('Beli Plastik'),methodId:paymentId,supplierName:z.string().trim().min(1).max(160),items:editPlasticPurchaseItems}),
  z.object({type:z.literal('Kirim Pabrik'),factoryName:z.string().trim().min(1).max(160),methodId:paymentId.optional(),items:editShipmentItems}),
]);
export class BusinessError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function unique(values: number[]) {
  if (new Set(values).size !== values.length) throw new BusinessError('Item duplikat tidak diperbolehkan', 400);
}
