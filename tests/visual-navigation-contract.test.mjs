import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
function walk(path) { return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(path,e.name)):[join(path,e.name)]); }
test('only approved non-navigation arrows remain in TSX', () => {
  const allowed = {
    'src/components/ProductImagesEditor.tsx': ['ArrowLeft','ArrowRight'],
    'src/pages/Auth.tsx': ['ArrowRight'],
    'src/pages/CatalogDetails.tsx': ['ArrowUpRight'],
  };
  for (const path of walk(join(root,'src')).filter(p=>p.endsWith('.tsx'))) {
    const actual = [...readFileSync(path,'utf8').matchAll(/<((?:ArrowRight|ArrowLeft|ArrowUpRight|MoveRight|MoveLeft))\b/g)].map(m=>m[1]).sort();
    assert.deepEqual(actual, (allowed[relative(root,path).replaceAll('\\','/')]??[]).sort(), relative(root,path));
  }
});
test('dashboard has one disclosure per recent activity item and no breakpoint-swapped arrows', () => {
  const page=read('src/pages/Dashboard.tsx');
  assert.equal((page.match(/<NavigationChevron\b/g)||[]).length,14);
  assert.equal((page.match(/<NavigationChevron className="sl-activity-chevron"/g)||[]).length,2);
  assert.doesNotMatch(page+read('src/pages/dashboard.css'),/sl-activity-arrow/);
});
test('cashier uses the same guarded New sale action at both widths', () => {
  const page=read('src/pages/Commerce.tsx');
  assert.equal((page.match(/cart.length \|\| notes \|\| tendered \? setClearRequested\(true\) : clearCart\(\)/g)||[]).length,1);
  assert.match(page,/\{compact && newSaleAction\}/);
  assert.match(page,/\{!compact && newSaleAction\}/);
  assert.match(page,/aria-label="Historial de ventas"/);
});
test('disclosure is decorative, with explicit forward and back modes', () => {
  const c=read('src/components/NavigationChevron.tsx');
  assert.match(c,/aria-hidden="true"/);
  assert.match(c,/direction === 'back' \? ChevronLeft : ChevronRight/);
});
