import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RetailData } from '../lib/contracts';
import { createRetailStore, type RetailLoader } from './retailStore';

vi.mock('../lib/supabase', () => ({ supabase: null }));

const userId = 'b3be5eb5-e26f-44be-b638-7c328621af5a';
const otherUserId = 'aaff0819-3cf9-4adb-b1fd-8e965cb7ea89';
function bootstrap(businessName = 'SmartLiving'): RetailData {
  return {
    profile: {
      id: userId,
      email: 'owner@example.test',
      display_name: 'Propietario',
      role: 'owner',
    },
    permissions: {
      manage_catalog: true,
      view_costs: true,
      sell: true,
      purchase: true,
      refund: true,
      manage_business: true,
      manage_team: true,
      view_audit: true,
    },
    settings: {
      id: 'global',
      business_name: businessName,
      tax_id: null,
      phone: null,
      email: null,
      address: null,
      currency: 'DOP',
      timezone: 'America/Santo_Domingo',
      tax_rate: 18,
      max_sale_discount_percent: 10,
      receipt_footer: null,
      updated_at: '2026-09-24T12:00:00Z',
    },
    products: [],
    variants: [],
    stocks: [],
    contacts: [],
    documents: [],
    document_items: [],
    movements: [],
    deliveries: [],
    promotions: [],
    audit: [],
    team: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createRetailStore', () => {
  it('keeps the snapshot stable between changes and notifies only subscribed readers', async () => {
    const loader = vi.fn<RetailLoader>().mockResolvedValue(bootstrap());
    const store = createRetailStore(userId, loader);
    const initial = store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.getSnapshot()).toBe(initial);
    expect(initial).toEqual({ data: null, error: '', refreshing: false, lastUpdated: null });
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
    const loaded = store.getSnapshot();
    expect(loaded.data?.profile.id).toBe(userId);
    expect(loaded.lastUpdated).toBeInstanceOf(Date);
    expect(store.getSnapshot()).toBe(loaded);
    unsubscribe();
    await store.refresh();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not let an older success overwrite the result of a newer request', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const loader = vi
      .fn<RetailLoader>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const store = createRetailStore(userId, loader);
    const oldRequest = store.refresh();
    const newRequest = store.refresh();
    second.resolve(bootstrap('Respuesta actual'));
    await newRequest;
    const snapshot = store.getSnapshot();
    first.resolve(bootstrap('Respuesta antigua'));
    await oldRequest;
    expect(store.getSnapshot()).toBe(snapshot);
    expect(snapshot.data?.settings.business_name).toBe('Respuesta actual');
  });

  it('keeps refreshing until the newest request settles, regardless of older completion', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const store = createRetailStore(
      userId,
      vi.fn<RetailLoader>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const oldRequest = store.refresh();
    const newRequest = store.refresh();
    first.resolve(bootstrap('Antigua'));
    await oldRequest;
    expect(store.getSnapshot()).toMatchObject({ data: null, refreshing: true });
    second.resolve(bootstrap('Actual'));
    await newRequest;
    expect(store.getSnapshot().refreshing).toBe(false);
  });

  it('does not let an old permission error erase a newer successful refresh', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const store = createRetailStore(
      userId,
      vi.fn<RetailLoader>().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );
    const oldRequest = store.refresh();
    const oldFailure = expect(oldRequest).rejects.toMatchObject({ code: '42501' });
    const newRequest = store.refresh();
    second.resolve(bootstrap());
    await newRequest;
    const snapshot = store.getSnapshot();
    first.reject({ code: '42501' });
    await oldFailure;
    expect(store.getSnapshot()).toBe(snapshot);
    expect(store.getSnapshot().error).toBe('');
  });

  it('clears privileged data and timestamp when live access is revoked', async () => {
    const revoked = { code: '42501', message: 'Acceso denegado' };
    const loader = vi
      .fn<RetailLoader>()
      .mockResolvedValueOnce(bootstrap())
      .mockRejectedValueOnce(revoked);
    const store = createRetailStore(userId, loader);
    await store.refresh();
    await expect(store.refresh()).rejects.toBe(revoked);
    expect(store.getSnapshot()).toMatchObject({ data: null, lastUpdated: null, refreshing: false });
    expect(store.getSnapshot().error).toMatch(/no tiene acceso/);
  });

  it('never restores old data when a delayed success arrives after access was revoked', async () => {
    const old = deferred<unknown>();
    const current = deferred<unknown>();
    const loader = vi
      .fn<RetailLoader>()
      .mockResolvedValueOnce(bootstrap())
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const store = createRetailStore(userId, loader);
    await store.refresh();
    const oldRequest = store.refresh();
    const currentRequest = store.refresh();
    const denied = expect(currentRequest).rejects.toMatchObject({ code: '42501' });
    current.reject({ code: '42501' });
    await denied;
    const revoked = store.getSnapshot();
    old.resolve(bootstrap('Acceso anterior'));
    await oldRequest;
    expect(store.getSnapshot()).toBe(revoked);
    expect(store.getSnapshot().data).toBeNull();
  });

  it.each(['PGRST301', 'PGRST303'])(
    'clears cached data when the session becomes invalid (%s)',
    async (code) => {
      const loader = vi
        .fn<RetailLoader>()
        .mockResolvedValueOnce(bootstrap())
        .mockRejectedValueOnce({ code });
      const store = createRetailStore(userId, loader);
      await store.refresh();
      await expect(store.refresh()).rejects.toMatchObject({ code });
      expect(store.getSnapshot().data).toBeNull();
    },
  );

  it('preserves valid cached data and update time when a network refresh fails', async () => {
    const failure = new TypeError('Failed to fetch');
    const loader = vi
      .fn<RetailLoader>()
      .mockResolvedValueOnce(bootstrap())
      .mockRejectedValueOnce(failure);
    const store = createRetailStore(userId, loader);
    await store.refresh();
    const previous = store.getSnapshot();
    await expect(store.refresh()).rejects.toBe(failure);
    expect(store.getSnapshot().data).toBe(previous.data);
    expect(store.getSnapshot().lastUpdated).toBe(previous.lastUpdated);
    expect(store.getSnapshot().error).toMatch(/Conservamos los datos/);
    expect(store.getSnapshot().refreshing).toBe(false);
  });

  it('shows an offline message while preserving existing data', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const loader = vi
      .fn<RetailLoader>()
      .mockResolvedValueOnce(bootstrap())
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const store = createRetailStore(userId, loader);
    await store.refresh();
    await expect(store.refresh()).rejects.toThrow('Failed to fetch');
    expect(store.getSnapshot().data).not.toBeNull();
    expect(store.getSnapshot().error).toMatch(/No hay conexión a internet/);
  });

  it('does not hide a revoked-access response behind the browser offline status', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    const store = createRetailStore(
      userId,
      vi.fn<RetailLoader>().mockRejectedValue({ code: '42501' }),
    );
    await expect(store.refresh()).rejects.toMatchObject({ code: '42501' });
    expect(store.getSnapshot().error).toMatch(/no tiene acceso/);
  });

  it('validates initial hydration instead of rendering a malformed server payload', async () => {
    const store = createRetailStore(
      userId,
      vi
        .fn<RetailLoader>()
        .mockResolvedValue({ ...bootstrap(), stocks: [{ variant_id: 'invalid', available: -1 }] }),
    );
    await expect(store.refresh()).rejects.toThrow(/información incompatible/);
    expect(store.getSnapshot()).toMatchObject({ data: null, lastUpdated: null, refreshing: false });
    expect(store.getSnapshot().error).toMatch(/información incompatible/);
  });

  it('keeps the previous valid snapshot when subsequent hydration fails validation', async () => {
    const loader = vi
      .fn<RetailLoader>()
      .mockResolvedValueOnce(bootstrap())
      .mockResolvedValueOnce({ ...bootstrap(), permissions: null });
    const store = createRetailStore(userId, loader);
    await store.refresh();
    const previous = store.getSnapshot();
    await expect(store.refresh()).rejects.toThrow(/información incompatible/);
    expect(store.getSnapshot().data).toBe(previous.data);
    expect(store.getSnapshot().lastUpdated).toBe(previous.lastUpdated);
  });

  it('rejects another user’s otherwise valid snapshot and removes cached account data', async () => {
    const other = bootstrap();
    other.profile.id = otherUserId;
    const store = createRetailStore(
      userId,
      vi.fn<RetailLoader>().mockResolvedValueOnce(bootstrap()).mockResolvedValueOnce(other),
    );
    await store.refresh();
    await expect(store.refresh()).rejects.toThrow(/sesión cambió/);
    expect(store.getSnapshot()).toMatchObject({ data: null, lastUpdated: null, refreshing: false });
  });

  it('discards pending results after cleanup and permits a StrictMode-style restart', async () => {
    const pending = deferred<unknown>();
    const store = createRetailStore(
      userId,
      vi
        .fn<RetailLoader>()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(bootstrap('Reinicio')),
    );
    const abandoned = store.refresh();
    store.invalidate();
    const invalidated = store.getSnapshot();
    expect(invalidated.refreshing).toBe(false);
    pending.resolve(bootstrap('No publicar'));
    await abandoned;
    expect(store.getSnapshot()).toBe(invalidated);
    await store.refresh();
    expect(store.getSnapshot().data?.settings.business_name).toBe('Reinicio');
  });

  it('does not publish an abandoned failure after cleanup', async () => {
    const pending = deferred<unknown>();
    const store = createRetailStore(userId, () => pending.promise);
    const request = store.refresh();
    const rejection = expect(request).rejects.toThrow('connection failed');
    store.invalidate();
    const invalidated = store.getSnapshot();
    pending.reject(new Error('connection failed'));
    await rejection;
    expect(store.getSnapshot()).toBe(invalidated);
    expect(store.getSnapshot().error).toBe('');
  });

  it('clears the failure banner only after a successful validated retry', async () => {
    const loader = vi
      .fn<RetailLoader>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(bootstrap());
    const store = createRetailStore(userId, loader);
    await expect(store.refresh()).rejects.toThrow();
    expect(store.getSnapshot().error).not.toBe('');
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({ error: '', refreshing: false });
    expect(store.getSnapshot().data).not.toBeNull();
  });

  it('reports missing configuration instead of leaving initial loading unresolved', async () => {
    const store = createRetailStore(userId);
    await expect(store.refresh()).rejects.toThrow(/conexión configurada/);
    expect(store.getSnapshot()).toMatchObject({ data: null, refreshing: false });
    expect(store.getSnapshot().error).toMatch(/conexión configurada/);
  });

  it('normalizes the legacy business brand for every consumer without mutating the loaded record', async () => {
    const record = bootstrap('Smart Living');
    const store = createRetailStore(userId, async () => record);
    await store.refresh();
    expect(store.getSnapshot().data?.settings.business_name).toBe('S-Mart Living');
    expect(record.settings.business_name).toBe('Smart Living');
  });
});
