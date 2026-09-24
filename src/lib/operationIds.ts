import type { Action } from './contracts';

const pending = new Map<string,string>();
const prefix = 'smartliving:operation:';
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function pendingOperation(userId: string, action: Action, payload: Record<string,unknown>, storage?: Pick<Storage,'getItem'|'setItem'|'removeItem'>) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({userId,action,payload})));
  const key = prefix + Array.from(new Uint8Array(digest),n => n.toString(16).padStart(2,'0')).join('');
  let id = pending.get(key);
  try { id ??= storage?.getItem(key) ?? undefined; } catch { /* Storage may be disabled. Memory remains usable. */ }
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) id = crypto.randomUUID();
  pending.set(key,id);
  try { storage?.setItem(key,id); } catch { /* No private business data is persisted here. */ }
  return { id, complete: () => { pending.delete(key); try { storage?.removeItem(key); } catch { /* No effect on the confirmed server operation. */ } } };
}
