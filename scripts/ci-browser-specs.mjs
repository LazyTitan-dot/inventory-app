import { execFileSync } from 'node:child_process';
import { appendFileSync, globSync, readFileSync, writeFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { pathToFileURL } from 'node:url';

// Suites compartidas por rutas que usan los mismos componentes o contratos.
const customers = ['customer-*', 'adaptation', 'whatsapp-feedback'];
const deliveries = ['delivery-*', 'adaptation', 'whatsapp-feedback'];
const inventory = ['inventory-*', 'catalog-*', 'product-*', 'pricing-*', 'label-upload', 'serial-barcode-v1', 'scanner', 'apple-spacing-v2-1'];
const purchases = ['purchase-*', 'cashier', 'adaptation', 'scanner'];
const sales = ['*sales*', 'cashier', 'adaptation', 'apple-spacing-v2-1', 'scanner', 'whatsapp-feedback'];
const dashboard = ['dashboard-*', 'reports-visual-v1'];

const rules = [
  [/^src\/pages\/supplier-/i, ['supplier-visual-v1']],
  [/^src\/pages\/(contacts[.]|customer-visual)/i, ['supplier-visual-v1', ...customers]],
  [/^(src\/(pages|components|lib)\/customer|customer-paddle\/|scripts\/prepare-customer)/i, customers],
  [/^src\/(components\/AddressFields|lib\/addresses)/, [...customers, ...deliveries]],
  [/^src\/(pages\/(operations|delivery)|lib\/delivery)/i, deliveries],
  [/^src\/(pages\/commerce[.]|lib\/cashier)/i, [...sales, ...purchases]],
  [/^src\/(pages|components|lib)\/purchase/i, purchases],
  [/^src\/(pages\/(sale|mobile-sales|windows-sales)|lib\/receiptPdf)/i, sales],
  [/^src\/(pages\/(apple-spacing|inventory-sales)|lib\/pricing)/i, [...inventory, ...sales, ...dashboard]],
  [/^src\/(pages\/(catalog|inventory|variant)|lib\/(catalog|sku))/i, inventory],
  [/^(src\/(components\/Product|lib\/(productLabel|labelOcr))|scripts\/prepare-label)/i, [...inventory, 'cashier']],
  [/^src\/(components|lib)\/(barcode|cameraScanner|continuousScan|softwareBarcodeDecoder)/i, [...inventory, ...purchases, ...sales, 'customer-live-scanner']],
  [/^src\/(components|lib)\/serial/i, ['serial-*', 'sales-visual-v1', 'inventory-visual-v1', 'scanner']],
  [/^src\/(pages|lib)\/(dashboard|reports)/i, dashboard],
  [/^src\/(pages\/auth|lib\/authSession)/i, ['auth-glass', 'shell']],
  [/^(src\/lib\/brand|scripts\/prepare-brand|public\/(brand|icons)\/|icons\/)/i, ['brand-icon-cleanup', 'auth-glass', 'shell', 'sales-visual-v1']],
  [/^src\/(pages\/(AfterSales|Settings)|components\/LegacyReport)/, ['shell', 'adaptation', 'serial-sales-v2', 'reports-visual-v1']],
  [/^(src\/(components|lib)\/whatsapp|public\/assets\/whatsapp)/i, ['whatsapp-feedback', 'customer-mobile-ux', 'delivery-visual-v1', 'sales-visual-v1']],
  [/^(\.github\/workflows\/ci\.yml|scripts\/ci-browser-specs\.mjs|tests\/ci-browser-specs\.test\.mjs)$/, ['shell', 'supplier-visual-v1']],
];

export function selectSpecs(changes, available) {
  const selected = new Set();
  for (const file of changes) {
    if (file.endsWith('.md') || /\.test\.tsx?$/.test(file)) continue;
    if (available.includes(file)) {
      selected.add(file);
      continue;
    }
    const rule = rules.find(([pattern]) => pattern.test(file));
    if (rule) {
      for (const pattern of rule[1]) {
        const matching = available.filter(spec => matchesGlob(spec, 'tests/shell/' + pattern + '.spec.ts'));
        if (!matching.length) throw new Error('Falta la suite de navegador: ' + pattern);
        for (const spec of matching) selected.add(spec);
      }
    } else if (/^(src\/|public\/|tests\/shell\/|supabase\/(migrations|functions)\/|scripts\/|customer-paddle\/|index\.html$|manifest\.json$|sw\.js$|package(-lock)?\.json$|(?:vite|playwright)\.config\.|vercel\.json$|tests\/tsconfig\.json$)/.test(file)) {
      return available;
    }
  }
  return [...selected].sort();
}

export function changedFiles(event) {
  const pr = event.pull_request;
  const base = pr ? pr.base.sha : event.before;
  const head = pr ? pr.head.sha : event.after;
  if (![base, head].every(sha => /^[a-f0-9]{40}$/.test(sha) && !/^0+$/.test(sha))) return null;
  try {
    const range = base + (pr ? '...' : '..') + head;
    // --no-renames incluye el módulo de origen y el de destino de cada traslado.
    return execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', range, '--'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).split('\0').filter(Boolean);
  } catch {
    console.warn('La base del cambio no está disponible. Se ejecutarán todas las suites de navegador.');
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const available = globSync('tests/shell/**/*.spec.ts').sort();
  if (!available.length) throw new Error('No se encontraron las suites de navegador.');
  const changes = changedFiles(JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')));
  const specs = changes === null ? available : selectSpecs(changes, available);
  console.log('Suites de navegador seleccionadas (' + specs.length + '):', ...specs);
  // Playwright interpreta sus argumentos como patrones; escapar los nombres reales.
  const filters = specs.map(spec => spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  writeFileSync(join(process.env.RUNNER_TEMP, 'browser-specs'), filters.map(filter => filter + '\0').join(''));
  appendFileSync(process.env.GITHUB_OUTPUT, 'required=' + Boolean(specs.length) + '\n');
}
