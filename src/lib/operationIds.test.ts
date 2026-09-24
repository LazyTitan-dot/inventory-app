import { describe, expect, it, vi } from 'vitest';
import { pendingOperation } from './operationIds';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
describe('identificador de operaciones', () => {
  it('reutiliza el identificador en un reintento aunque cambie el orden de los campos', async () => {
    const storage = memoryStorage();
    const first = await pendingOperation(
      'actor-a',
      'create_sale',
      { items: [{ variant_id: 'x', quantity: 1 }], notes: 'datos privados' },
      storage,
    );
    const retry = await pendingOperation(
      'actor-a',
      'create_sale',
      { notes: 'datos privados', items: [{ quantity: 1, variant_id: 'x' }] },
      storage,
    );
    expect(retry.id).toBe(first.id);
    expect(JSON.stringify([...storage.values])).not.toContain('datos privados');
    first.complete();
    expect(storage.values.size).toBe(0);
    expect(
      (
        await pendingOperation(
          'actor-a',
          'create_sale',
          { items: [{ variant_id: 'x', quantity: 1 }], notes: 'datos privados' },
          storage,
        )
      ).id,
    ).not.toBe(first.id);
  });
  it('separa cuentas y cambios de intención', async () => {
    const one = await pendingOperation('actor-b', 'adjust_stock', { quantity: 1 });
    const two = await pendingOperation('actor-c', 'adjust_stock', { quantity: 1 });
    const changed = await pendingOperation('actor-b', 'adjust_stock', { quantity: 2 });
    expect(new Set([one.id, two.id, changed.id]).size).toBe(3);
  });
  it('se recupera de una recarga usando el registro persistido', async () => {
    const storage = memoryStorage();
    const first = await pendingOperation('actor-d', 'create_sale', { items: [1] }, storage);
    vi.resetModules();
    const reloaded = await import('./operationIds');
    expect(
      (await reloaded.pendingOperation('actor-d', 'create_sale', { items: [1] }, storage)).id,
    ).toBe(first.id);
  });
  it('permite reintentar incluso si el navegador bloquea almacenamiento', async () => {
    const denied = {
      getItem: () => {
        throw Error('denied');
      },
      setItem: () => {
        throw Error('denied');
      },
      removeItem: () => {
        throw Error('denied');
      },
    };
    const first = await pendingOperation('actor-e', 'save_contact', { name: 'Nombre' }, denied);
    expect((await pendingOperation('actor-e', 'save_contact', { name: 'Nombre' }, denied)).id).toBe(
      first.id,
    );
    expect(first.complete).not.toThrow();
  });
});
