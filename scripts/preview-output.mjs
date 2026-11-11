import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const stagingProjectRef = 'wvegljmwszvywhngcitr';
const stagingOrigin = `https://${stagingProjectRef}.supabase.co`;
const stagingSocketOrigin = `wss://${stagingProjectRef}.supabase.co`;

async function removeOwnedPreviewOutput(root) {
  const output = path.join(root, '.vercel', 'output');
  let metadata;
  try {
    metadata = JSON.parse(await readFile(path.join(output, 'static', 'preview-environment.json'), 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || error?.code === 'ENOENT') return false;
    throw error;
  }
  if (metadata?.environment !== 'preview' || metadata?.projectRef !== stagingProjectRef) return false;
  await rm(output, { recursive: true, force: true });
  return true;
}

function headerPattern(source) {
  if (source === '/(.*)') return '^/(.*)$';
  if (typeof source !== 'string' || !/^\/[\w./-]+$/.test(source)) {
    throw new Error('Preview output requires reviewed static header paths.');
  }
  return `^${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function previewCsp(policy) {
  if (typeof policy !== 'string') throw new Error('Preview output requires the existing CSP.');
  let replacements = 0;
  const result = policy.replace(/(^|;\s*)connect-src(?:\s[^;]*)?(?=;|$)/g, (_match, prefix) => {
    replacements++;
    return `${prefix}connect-src 'self' ${stagingOrigin} ${stagingSocketOrigin}`;
  });
  if (replacements !== 1) throw new Error('Preview output requires exactly one connect-src directive.');
  return result;
}

/**
 * Generate Vercel Build Output API v3 only for this isolated preview backend.
 * Normal/production builds keep dist and the checked-in vercel.json unchanged.
 * https://vercel.com/docs/build-output-api/configuration
 */
export async function generatePreviewOutput({ root = process.cwd(), env = process.env } = {}) {
  if (env.VERCEL_ENV !== 'preview') {
    const cleaned = await removeOwnedPreviewOutput(root);
    return cleaned ? { generated: false, cleaned: true } : { generated: false };
  }
  if (env.PHASE5_STAGING_PROJECT_REF !== stagingProjectRef) {
    throw new Error('Preview output requires the dedicated Phase 5 staging project reference.');
  }
  const effectiveOrigin = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (effectiveOrigin !== stagingOrigin) {
    throw new Error('Preview output requires the dedicated Phase 5 staging API origin.');
  }

  const project = JSON.parse(await readFile(path.join(root, 'vercel.json'), 'utf8'));
  if (!Array.isArray(project.headers) || !Array.isArray(project.rewrites)) {
    throw new Error('Preview output requires the existing header and SPA routing configuration.');
  }
  let cspHeaders = 0;
  const routes = project.headers.map(({ source, headers }) => {
    if (!Array.isArray(headers)) throw new Error('Preview output requires reviewed response headers.');
    const mapped = Object.fromEntries(headers.map(({ key, value }) => {
      if (key.toLowerCase() === 'content-security-policy') {
        cspHeaders++;
        return [key, previewCsp(value)];
      }
      return [key, value];
    }));
    if (source === '/(.*)') mapped['X-Robots-Tag'] = 'noindex, nofollow';
    const route = { src: headerPattern(source), headers: mapped, continue: true };
    const csp = Object.entries(mapped).find(([key]) => key.toLowerCase() === 'content-security-policy');
    if (csp) {
      // Vercel also merges vercel.json headers after Build Output headers.
      // Apply the isolated policy as a final response transform as well.
      route.transforms = [{ type: 'response.headers', op: 'set', target: { key: 'content-security-policy' }, args: csp[1] }];
    }
    return route;
  });
  if (cspHeaders !== 1) throw new Error('Preview output requires exactly one existing CSP header.');
  routes.push({ src: '^/preview-environment\\.json$', headers: { 'Cache-Control': 'no-store' }, continue: true });
  routes.push({ handle: 'filesystem' });
  for (const { source, destination } of project.rewrites) {
    if (source !== '/((?!assets/|brand/|icons/|favicon.svg|manifest.json|sw.js).*)' || destination !== '/index.html') {
      throw new Error('Preview output requires the reviewed SPA fallback and asset exclusions.');
    }
    routes.push({ src: `^${source}$`, dest: destination });
  }
  if (project.rewrites.length !== 1) throw new Error('Preview output requires one reviewed SPA fallback.');

  const dist = path.join(root, 'dist');
  if (!(await stat(path.join(dist, 'index.html'))).isFile()) {
    throw new Error('Preview output requires a completed Vite build.');
  }
  const output = path.join(root, '.vercel', 'output');
  const staticRoot = path.join(output, 'static');
  // Only generated artifacts are replaced; source configuration is read-only.
  await rm(output, { recursive: true, force: true });
  await mkdir(staticRoot, { recursive: true });
  await cp(dist, staticRoot, { recursive: true });
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const metadata = {
    environment: 'preview',
    projectRef: stagingProjectRef,
    gitCommitSha: typeof commit === 'string' && /^[a-f\d]{40}$/i.test(commit) ? commit : null,
  };
  await writeFile(path.join(staticRoot, 'preview-environment.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  // Write the valid output configuration last, after all static files exist.
  await writeFile(path.join(output, 'config.json'), `${JSON.stringify({ version: 3, routes }, null, 2)}\n`);
  return { generated: true, projectRef: stagingProjectRef };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await generatePreviewOutput();
    if (result.generated) console.log('Generated isolated Phase 5 preview output.');
    else if (result.cleaned) console.log('Removed stale Phase 5 preview output.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Preview output generation failed.');
    process.exitCode = 1;
  }
}
