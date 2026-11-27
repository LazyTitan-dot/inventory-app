const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:unknown,status:number)=>Response.json(body,{status,headers});
const endpoint='https://twkpgzxkzdtgkkuahntr.supabase.co/functions/v1/storefront-orders-v1';
export async function POST(req:Request){
  const origin=req.headers.get('origin');
  if(!origin||origin!==new URL(req.url).origin||req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply({error:'Solicitud inválida'},400);
  if(!req.body)return reply({error:'Solicitud inválida'},400);
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>16000){await reader.cancel();return reply({error:'Solicitud demasiado grande'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}
    let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return reply({error:'Solicitud inválida'},400);}
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)});
    if([400,409,429].includes(r.status))return reply({error:'No se pudo registrar la solicitud'},r.status);
    if(r.status!==202)return reply({error:'Pedidos no disponibles'},503);
    const result=await r.json();
    if(typeof result?.id!=='string'||result.status!=='received')return reply({error:'Pedidos no disponibles'},503);
    return reply({id:result.id,status:'received'},202);
  }catch{return reply({error:'Pedidos no disponibles'},503);}
  finally{reader.releaseLock();}
}
