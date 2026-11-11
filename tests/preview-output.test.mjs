import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { generatePreviewOutput } from '../scripts/preview-output.mjs';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../scripts/preview-output.mjs', import.meta.url));
const sourceConfiguration = await readFile(new URL('../vercel.json', import.meta.url), 'utf8');
const projectRef = 'wvegljmwszvywhngcitr';
const origin = `https://${projectRef}.supabase.co`;
const productionRef = 'twkpgzxkzdtgkkuahntr';
const gitCommitSha = '1234567890abcdef1234567890abcdef12345678';
const previewEnv = { VERCEL_ENV: 'preview', PHASE5_STAGING_PROJECT_REF: projectRef, VITE_SUPABASE_URL: origin, VERCEL_GIT_COMMIT_SHA: gitCommitSha };

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'phase5-preview-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'dist', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'dist', 'brand'), { recursive: true });
  await writeFile(path.join(root, 'vercel.json'), sourceConfiguration);
  await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html><html lang="es"><body>local fixture</body></html>');
  await writeFile(path.join(root, 'dist', 'assets', 'app-abc.js'), 'console.log("local static fixture");');
  await writeFile(path.join(root, 'dist', 'brand', 'logo.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await writeFile(path.join(root, 'dist', 'sw.js'), '// local retired worker');
  return root;
}

async function outputConfig(root) {
  return JSON.parse(await readFile(path.join(root, '.vercel', 'output', 'config.json'), 'utf8'));
}

test('preview output preserves static resources, security headers and cache rules with isolated backend routing', async t => {
  const root = await fixture(t);
  await generatePreviewOutput({ root, env: { ...previewEnv, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_not_metadata' } });
  const config = await outputConfig(root);
  assert.equal(config.version, 3);
  const global = config.routes.find(route => route.src === '^/(.*)$');
  const source = JSON.parse(sourceConfiguration).headers.find(route => route.source === '/(.*)');
  const originalCsp = source.headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.equal(global.continue, true);
  assert.equal(global.headers['X-Robots-Tag'], 'noindex, nofollow');
  assert.equal(global.headers['Content-Security-Policy'], originalCsp.replace(/connect-src[^;]+/, `connect-src 'self' ${origin} wss://${projectRef}.supabase.co`));
  assert.ok(!JSON.stringify(config).includes(productionRef));
  for (const header of source.headers.filter(header => header.key !== 'Content-Security-Policy')) {
    assert.equal(global.headers[header.key], header.value);
  }
  const filesystem = config.routes.findIndex(route => route.handle === 'filesystem');
  assert.ok(filesystem > config.routes.findIndex(route => route.headers?.['Cache-Control'] === 'no-store'));
  assert.ok(filesystem > config.routes.findIndex(route => route.headers?.['Cache-Control'] === 'no-cache'));
  const fallback = config.routes.at(-1);
  assert.equal(filesystem, config.routes.length - 2);
  assert.equal(fallback.dest, '/index.html');
  const matcher = new RegExp(fallback.src);
  assert.ok(matcher.test('/inventario'));
  assert.ok(matcher.test('/recuperar'));
  assert.ok(!matcher.test('/brand/missing.png'));
  assert.ok(!matcher.test('/assets/missing.js'));
  const sw = config.routes.find(route => new RegExp(route.src || '^never$').test('/sw.js') && route.headers?.['Cache-Control']);
  assert.equal(sw.headers['Cache-Control'], 'no-store');
  assert.ok(!new RegExp(sw.src).test('/swXjs'));
  for (const file of ['index.html', 'assets/app-abc.js', 'brand/logo.png', 'sw.js']) {
    assert.deepEqual(await readFile(path.join(root, '.vercel', 'output', 'static', file)), await readFile(path.join(root, 'dist', file)));
  }
  const metadata = await readFile(path.join(root, '.vercel', 'output', 'static', 'preview-environment.json'), 'utf8');
  assert.deepEqual(JSON.parse(metadata), { environment: 'preview', projectRef, gitCommitSha });
  assert.ok(!metadata.includes('sb_publishable_test_not_metadata'));
  assert.equal(await readFile(path.join(root, 'vercel.json'), 'utf8'), sourceConfiguration);
});

for (const environment of [undefined, 'development', 'production']) {
  test(`normal ${environment ?? 'local'} build is a no-op even without staging configuration`, async t => {
    const root = await fixture(t);
    await mkdir(path.join(root, '.vercel', 'output'), { recursive: true });
    await writeFile(path.join(root, '.vercel', 'output', 'existing-marker'), 'leave generated files unchanged');
    assert.deepEqual(await generatePreviewOutput({ root, env: { VERCEL_ENV: environment } }), { generated: false });
    assert.equal(await readFile(path.join(root, '.vercel', 'output', 'existing-marker'), 'utf8'), 'leave generated files unchanged');
    await assert.rejects(readFile(path.join(root, '.vercel', 'output', 'config.json')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(root, 'vercel.json'), 'utf8'), sourceConfiguration);
  });
}

test('a production build removes only positively identified prior staging output', async t => {
  const root = await fixture(t);
  await generatePreviewOutput({ root, env: previewEnv });
  assert.equal((await outputConfig(root)).version, 3);
  const dist = await readFile(path.join(root, 'dist', 'index.html'));
  assert.deepEqual(await generatePreviewOutput({ root, env: { VERCEL_ENV: 'production' } }), { generated: false, cleaned: true });
  await assert.rejects(readFile(path.join(root, '.vercel', 'output', 'config.json')), { code: 'ENOENT' });
  assert.deepEqual(await readFile(path.join(root, 'dist', 'index.html')), dist);
  assert.equal(await readFile(path.join(root, 'vercel.json'), 'utf8'), sourceConfiguration);
});

test('production cleanup leaves unrelated or unrecognized output metadata untouched', async t => {
  const root = await fixture(t);
  const staticRoot = path.join(root, '.vercel', 'output', 'static');
  await mkdir(staticRoot, { recursive: true });
  const configFile = path.join(root, '.vercel', 'output', 'config.json');
  await writeFile(configFile, '{"version":3,"unrelated":true}');
  for (const metadata of [
    JSON.stringify({ environment: 'preview', projectRef: 'another-project' }),
    JSON.stringify({ environment: 'production', projectRef }),
    'incomplete JSON',
  ]) {
    await writeFile(path.join(staticRoot, 'preview-environment.json'), metadata);
    assert.deepEqual(await generatePreviewOutput({ root, env: { VERCEL_ENV: 'production' } }), { generated: false });
    assert.equal(await readFile(configFile, 'utf8'), '{"version":3,"unrelated":true}');
  }
});

for (const [name, override] of [
  ['missing project reference', { PHASE5_STAGING_PROJECT_REF: undefined }],
  ['wrong project reference', { PHASE5_STAGING_PROJECT_REF: productionRef }],
  ['missing API origin', { VITE_SUPABASE_URL: undefined }],
  ['production API origin', { VITE_SUPABASE_URL: `https://${productionRef}.supabase.co` }],
  ['another staging origin', { VITE_SUPABASE_URL: 'https://different-project.supabase.co' }],
  ['primary origin overrides compatible fallback', { VITE_SUPABASE_URL: `https://${productionRef}.supabase.co`, NEXT_PUBLIC_SUPABASE_URL: origin }],
]) {
  test(`preview rejects ${name} before replacing output`, async t => {
    const root = await fixture(t);
    await mkdir(path.join(root, '.vercel', 'output'), { recursive: true });
    await writeFile(path.join(root, '.vercel', 'output', 'existing-marker'), 'previous build');
    await assert.rejects(generatePreviewOutput({ root, env: { ...previewEnv, ...override } }), /dedicated Phase 5 staging/);
    assert.equal(await readFile(path.join(root, '.vercel', 'output', 'existing-marker'), 'utf8'), 'previous build');
  });
}

test('compatibility URL fallback is supported and invalid commit metadata is never echoed', async t => {
  const root = await fixture(t);
  await generatePreviewOutput({ root, env: { ...previewEnv, VITE_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_URL: origin, VERCEL_GIT_COMMIT_SHA: 'not-a-git-sha' } });
  const metadata = JSON.parse(await readFile(path.join(root, '.vercel', 'output', 'static', 'preview-environment.json'), 'utf8'));
  assert.deepEqual(metadata, { environment: 'preview', projectRef, gitCommitSha: null });
});

test('missing Vite output and changed security/routing assumptions fail before publication', async t => {
  const root = await fixture(t);
  await rm(path.join(root, 'dist', 'index.html'));
  await assert.rejects(generatePreviewOutput({ root, env: previewEnv }), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(root, '.vercel', 'output', 'config.json')), { code: 'ENOENT' });
  await writeFile(path.join(root, 'dist', 'index.html'), '<!doctype html>');
  const config = JSON.parse(sourceConfiguration);
  const csp = config.headers[0].headers.find(header => header.key === 'Content-Security-Policy');
  csp.value = "default-src 'self'";
  await writeFile(path.join(root, 'vercel.json'), JSON.stringify(config));
  await assert.rejects(generatePreviewOutput({ root, env: previewEnv }), /exactly one connect-src/);
  const routing = JSON.parse(sourceConfiguration);
  routing.rewrites = [{ source: '/(.*)', destination: '/index.html' }];
  await writeFile(path.join(root, 'vercel.json'), JSON.stringify(routing));
  await assert.rejects(generatePreviewOutput({ root, env: previewEnv }), /reviewed SPA fallback/);
});

test('CLI generates the preview and rebuild removes stale generated files', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, '.vercel', 'output', 'static'), { recursive: true });
  await writeFile(path.join(root, '.vercel', 'output', 'static', 'stale.js'), 'old output');
  const { stdout } = await execute(process.execPath, [script], { cwd: root, env: { ...process.env, ...previewEnv } });
  assert.match(stdout, /Generated isolated Phase 5 preview output/);
  assert.equal((await outputConfig(root)).version, 3);
  await assert.rejects(readFile(path.join(root, '.vercel', 'output', 'static', 'stale.js')), { code: 'ENOENT' });
});
