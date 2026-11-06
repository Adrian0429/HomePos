import { ZodError } from 'zod';
import { BusinessError } from './validation';
export async function endpoint(action: () => Promise<unknown>, status = 200) {
  try { return Response.json(await action(), {status}); }
  catch (error) {
    if (error instanceof ZodError) return Response.json({error:'Input tidak valid', details:error.issues}, {status:400});
    if (error instanceof SyntaxError) return Response.json({error:'JSON tidak valid'}, {status:400});
    if (error instanceof BusinessError) return Response.json({error:error.message}, {status:error.status});
    const code = (error as {code?:string}).code;
    if (code && ['23503','23514','22003','22007','22008'].includes(code))
      return Response.json({error:'Referensi, tanggal, atau nilai di luar batas database'}, {status:400});
    console.error(error);
    return Response.json({error:'Kesalahan internal server'}, {status:500});
  }
}
