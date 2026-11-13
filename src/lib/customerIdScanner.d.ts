export type ScanMode='auto'|'new'|'old'|'front'|'combined';
export interface CustomerScan {ced:string;first:string;last:string;full:string;address:string;sector:string;municipio:string;sources:Record<string,string>;warning:string;}
export function scanCustomerId(file:File,mode:ScanMode,onProgress?:(message:string)=>void):Promise<CustomerScan>;
