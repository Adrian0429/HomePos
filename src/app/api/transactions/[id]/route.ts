import { endpoint } from '@/lib/http';
import { deleteTransaction, editTransaction, getTransactionDetails } from '@/lib/transactions';
import { editTransactionInput, id } from '@/lib/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};

export async function GET(_request:Request,context:Context){
  return endpoint(async()=>getTransactionDetails(id.parse(Number((await context.params).id))));
}
export async function PATCH(request:Request,context:Context){
  return endpoint(async()=>editTransaction(id.parse(Number((await context.params).id)),editTransactionInput.parse(await request.json())));
}
export async function DELETE(_request:Request,context:Context){
  return endpoint(async()=>deleteTransaction(id.parse(Number((await context.params).id))));
}
