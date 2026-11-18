import { endpoint } from '@/lib/http';
import { recordDebtPayment } from '@/lib/transactions';
import { debtPaymentInput, id } from '@/lib/validation';

export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  return endpoint(async()=>recordDebtPayment(id.parse(Number((await context.params).id)),debtPaymentInput.parse(await request.json())));
}
