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
  z.object({type: z.literal('Jual Minuman'), transactionDate: date, methodId: paymentId,
    customerName: z.string().trim().max(160).optional(),
    items: lines(z.object({productId: id, jumlah: z.number().int().positive().max(1000000), hargaSatuan: price}))}),
  z.object({type: z.literal('Beli Plastik'), transactionDate: date, methodId: paymentId,
    supplierName: z.string().trim().min(1,'Pilih atau isi nama supplier').max(160),
    items: lines(z.object({plastikId: id, berat: positiveWeight, hargaSatuan: price}))}),
  z.object({type: z.literal('Kirim Pabrik'), transactionDate: date,
    items: lines(z.object({plastikId: id, beratKirim: positiveWeight}))})
]);
export const settleInput = z.object({methodId: paymentId, items: lines(z.object({
  detailId: id, beratDiterima: weight, hargaSatuan: price
}))});
export class BusinessError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function unique(values: number[]) {
  if (new Set(values).size !== values.length) throw new BusinessError('Item duplikat tidak diperbolehkan', 400);
}
