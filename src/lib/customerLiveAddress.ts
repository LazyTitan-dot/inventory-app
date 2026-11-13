export function addressGuide(w:number,h:number){
 const width=Math.round(w*.86),height=Math.round(Math.min(h*.82,width/1.65));
 return {x:Math.round((w-width)/2),y:Math.round((h-height)/2),width,height};
}
const clean=(v:string)=>v.trim().replace(/^[\s:|.-]+|[\s|]+$/g,'').trim();
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
export function parseAddressBlock(text:string){
 const lines=text.split(/\r?\n/).map(clean).filter(Boolean);
 let field:'address'|'sector'|'municipio'|null=null;
 const out={address:'',sector:'',municipio:''};
 let header=false,sector=false,town=false;
 for(const line of lines){
   const n=norm(line);
   const m=n.match(/^(DIRECCI[O0]N\s+(?:DE\s+)?RESIDENCIA|SECTOR|MUNICIPIO)\b\s*[:.-]?\s*/);
   if(m){
     const label=m[1]!;
     field=label.startsWith('DIRECCI')?'address':label==='SECTOR'?'sector':'municipio';
     if(field==='address')header=true;else if(field==='sector')sector=true;else town=true;
     const tail=clean(line.slice(m[0].length));if(tail)out[field]=tail;
     continue;
   }
   if(!field||/^(COLEGIO|UBICACI[O0]N|REGISTRO|CEDULA|IDDOM|CODIGO POSTAL)\b/.test(n))continue;
   if(field==='address')out.address+=(out.address?'\n':'')+line;
   else if(!out[field])out[field]=line;
 }
 return { ...out, complete:header&&sector&&town&&!!out.address&&!!out.sector&&!!out.municipio };
}
