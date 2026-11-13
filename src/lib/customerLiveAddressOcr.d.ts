export function readLiveAddress(file:File,onProgress?:(message:string)=>void):Promise<{address:string;sector:string;municipio:string;warning:string}>;
