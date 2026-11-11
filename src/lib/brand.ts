export const BRAND_NAME = 'S-Mart Living';

/** Normalize former names of this business without renaming other businesses. */
export function displayBusinessName(name: string | null | undefined): string {
  const value = name?.trim() ?? '';
  const comparable = value.normalize('NFKC').replace(/[\s_.–—-]+/gu, '').toLowerCase();
  return comparable === 'smartliving' || comparable === 'smartlivinghome' ? BRAND_NAME : value;
}
