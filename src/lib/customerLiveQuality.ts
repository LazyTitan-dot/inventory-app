export type Point = { x: number; y: number };
export type CardCrop = { x: number; y: number; width: number; height: number; size: number; cx: number; cy: number };
export function cardCrop(tl: Point, tr: Point, bl: Point, br: Point, width: number, height: number): CardCrop | null {
  const dx=tr.x-tl.x, dy=tr.y-tl.y, ux=bl.x-tl.x, uy=bl.y-tl.y;
  const size=Math.hypot(dx,dy), vertical=Math.hypot(ux,uy);
  if(size<135||vertical<125||Math.abs(dy)>size*.20||Math.abs(ux)>vertical*.20||vertical/size<.8||vertical/size>1.2)return null;
  if(Math.hypot(br.x-tr.x-ux,br.y-tr.y-uy)>size*.16)return null;
  const points=[[-2.2,-.26],[3.92,-.26],[3.92,3.76],[-2.2,3.76]].map(([a,b])=>({x:tl.x+a!*dx+b!*ux,y:tl.y+a!*dy+b!*uy}));
  const x=Math.floor(Math.min(...points.map(p=>p.x))),y=Math.floor(Math.min(...points.map(p=>p.y)));
  const r=Math.ceil(Math.max(...points.map(p=>p.x))),b=Math.ceil(Math.max(...points.map(p=>p.y)));
  if(x < -size*.16||y < -size*.16||r>width+size*.16||b>height+size*.16)return null;
  const X=Math.max(0,x),Y=Math.max(0,y),R=Math.min(width,r),B=Math.min(height,b);
  if(R-X<800||B-Y<430)return null;
  return {x:X,y:Y,width:R-X,height:B-Y,size,cx:tl.x,cy:tl.y};
}
export function stableCrop(a:CardCrop,b:CardCrop){
  return Math.hypot(a.cx-b.cx,a.cy-b.cy)<=a.size*.055&&Math.abs(a.size-b.size)<=a.size*.055;
}
export function textSharpness(ctx:CanvasRenderingContext2D,c:CardCrop){
  const x=Math.floor(c.x+c.width*.53),y=Math.floor(c.y+c.height*.28),w=Math.floor(c.width*.32),h=Math.floor(c.height*.29);
  const d=ctx.getImageData(x,y,w,h).data;
  const lum=(p:number)=>Math.max(d[p]!,d[p+1]!,d[p+2]!);
  let total=0,n=0;
  for(let j=1;j<h-1;j+=2)for(let i=1;i<w-1;i+=2){const p=(j*w+i)*4;total+=Math.abs(lum(p)-lum(p-4))+Math.abs(lum(p)-lum(p-w*4));n+=2;}
  return n?total/n:0;
}

export const usablePlace=(v:string)=>/^[\p{L}\p{M}\d .'-]+$/u.test(v.trim())&&/\p{L}{4}/u.test(v);
export function usableLiveAddress(address:string,sector:string,municipio:string){
 const t=address.trim();
 return t.length>=10&&t.length<=400&&usablePlace(sector)&&usablePlace(municipio)&&!/(direcci[oó]n\s+de\s+residencia|colegio electoral|ubicaci[oó]n del colegio)/i.test(t)&&!/[|<>=[\]{}~_]/.test(t)&&/\p{L}{4}/u.test(t)&&t.split(/\s+/).filter(x=>/\p{L}{2}/u.test(x)).length>=3;

}
