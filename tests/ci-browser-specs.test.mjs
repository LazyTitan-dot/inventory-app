import assert from 'node:assert/strict';
import { globSync } from 'node:fs';
import test from 'node:test';
import { changedFiles, selectSpecs } from '../scripts/ci-browser-specs.mjs';

const specs = globSync('tests/shell/**/*.spec.ts').sort();
const spec = name => 'tests/shell/' + name + '.spec.ts';

test('un cambio exclusivo de Proveedores selecciona su propia suite', () => {
  assert.deepEqual(selectSpecs(['src/pages/supplier-visual-v1.css'], specs), [spec('supplier-visual-v1')]);
});

test('un cambio compartido se comprueba en cada módulo afectado una sola vez', () => {
  const contacts = selectSpecs(['src/pages/Contacts.tsx', 'src/pages/supplier-visual-v1.css'], specs);
  for (const name of ['supplier-visual-v1', 'customer-mobile-ux', 'customer-live-scanner']) {
    assert.ok(contacts.includes(spec(name)));
  }
  assert.equal(contacts.length, new Set(contacts).size);
  const commerce = selectSpecs(['src/pages/Commerce.tsx'], specs);
  for (const name of ['purchase-visual-v2-2', 'sales-visual-v1', 'serial-sales-v2', 'scanner']) {
    assert.ok(commerce.includes(spec(name)));
  }
});

test('los archivos de prueba seleccionan el caso vigente y las rutas compartidas amplían la cobertura', () => {
  assert.deepEqual(selectSpecs([spec('customer-id-scanner')], specs), [spec('customer-id-scanner')]);
  assert.deepEqual(selectSpecs([spec('retirado')], specs), specs);
  assert.deepEqual(selectSpecs(['tests/shell/fixtures.ts'], specs), specs);
  assert.deepEqual(selectSpecs(['src/pages/ModuloNuevo.tsx'], specs), specs);
  assert.deepEqual(selectSpecs(['docs/verification-log.md', 'src/lib/serials.test.ts'], specs), []);
  assert.deepEqual(selectSpecs(['.github/workflows/ci.yml'], specs), [spec('shell'), spec('supplier-visual-v1')]);
});

test('la primera publicación sin una base comparable solicita la batería completa', () => {
  assert.equal(changedFiles({before: '0'.repeat(40), after: '1'.repeat(40)}), null);
});
