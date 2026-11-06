import { endpoint } from '@/lib/http';
import { id, settleInput } from '@/lib/validation';
import { settleTransaction } from '@/lib/transactions';
export const runtime = 'nodejs';
export async function PATCH(request: Request, context: {params: Promise<{id: string}>}) {
  return endpoint(async () => settleTransaction(id.parse(Number((await context.params).id)), settleInput.parse(await request.json())));
}
