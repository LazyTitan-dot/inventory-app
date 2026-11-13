export type LiveIdentity = { ced: string; full: string; first: string; last: string; mode: 'new' | 'old'; source: string };

export function readIdentityCode(raw: string, kind: 'qr' | 'barcode'): LiveIdentity | null {
  if (kind === 'qr') {
    const parts = raw.split('|').map(v => v.trim());
    const digits = parts[0]?.replace(/-/g, '') ?? '';
    if (parts.length < 4 || !/^\d{11}$/.test(digits) || !parts.slice(1,4).every(v => /^[\p{L} .'-]+$/u.test(v) && v.length <= 100)) return null;
    return { ced: digits, first: parts[1]!, last: parts[2]+' '+parts[3], full: parts.slice(1,4).join(' '), mode: 'new', source: 'QR del documento' };
  }
  if (!/^[A-D]?\d{11}[A-D]?$/i.test(raw.trim())) return null;
  return { ced: raw.replace(/\D/g,''), first:'',last:'',full:'',mode:'old',source:'Código de barras' };
}

