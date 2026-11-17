import {test,expect} from './fixtures';

/** Brand V1: use exact full-frame V4 image on Windows and iPhone.
 * Browser tests do NOT contact production accounts or mutate stock.
 */
for(const width of [390,1440]){
 for(const theme of ['light','dark'] as const){
  test('full-frame business icon and unchanged horizontal wordmark '+width+' '+theme,async({page},testInfo)=>{
   await page.setViewportSize({width,height:900});
   await page.emulateMedia({colorScheme:theme});
   await page.goto('/');
   const business=page.locator('.business-switch .business-avatar img');
   await expect(business).toBeAttached();
   await expect(business).toHaveAttribute('src','/icons/s-mart-living-v4-192.png');
   await expect.poll(()=>business.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBe(192);
   const brand=page.locator('.sidebar-brand img');
   await expect(brand).toHaveAttribute('src','/brand/primary_dark.png');
   await expect.poll(()=>brand.evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);
   const style=await business.evaluate(el=>{
    const s=getComputedStyle(el);
    return {fit:s.objectFit,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height};
   });
   expect(style.fit).toBe('cover');
   expect(style.width).toBe(32);
   expect(style.height).toBe(32);
   const corner=await business.evaluate((node:HTMLImageElement)=>{
    const c=document.createElement('canvas');c.width=c.height=32;
    const ctx=c.getContext('2d')!;ctx.drawImage(node,0,0,32,32);
    return Array.from(ctx.getImageData(1,1,1,1).data);
   });
   expect(corner[0]!+corner[1]!+corner[2]!).toBeLessThan(700);
   if(width>=800)await page.screenshot({path:testInfo.outputPath('windows-brand-'+theme+'.png'),fullPage:true});
   else await page.screenshot({path:testInfo.outputPath('iphone-brand-'+theme+'.png'),fullPage:true});
  });
 }
}

test('favicon, PWA and document startup reference approved V4 variants',async({page})=>{
 await page.goto('/');
 const icon=page.locator('head link[rel="icon"]');
 await expect(icon).toHaveAttribute('href','/icons/s-mart-living-v4-192.png');
 const touch=page.locator('head link[rel="apple-touch-icon"]');
 await expect(touch).toHaveAttribute('href','/icons/s-mart-living-v4-180.png');
 const doc=await page.request.get('/');
 expect(doc.status()).toBe(200);
 const html=await doc.text();
 expect(html).toContain('class="sl-startup-logo" src="/icons/s-mart-living-v4-512.png"');
 expect(html).not.toContain('/brand/square_icon.png');
 const manifestResponse=await page.request.get('/manifest.json');
 expect(manifestResponse.ok()).toBe(true);
 const manifest=await manifestResponse.json();
 expect(manifest.icons.map((i:{src:string})=>i.src)).toEqual([
  '/icons/s-mart-living-v4-192.png','/icons/s-mart-living-v4-512.png'
 ]);
 const expected=[
  '/icons/s-mart-living-v4-192.png',
  '/icons/s-mart-living-v4-512.png',
  '/icons/s-mart-living-v4-180.png',
  '/brand/square_icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
 ];
 for(const path of expected){
  const img=await page.request.get(path);
  expect(img.ok(),path).toBe(true);
  expect(img.headers()['content-type'],path).toContain('image/png');
 }
 const old192=await page.request.get('/icons/icon-192.png');
 const v4_192=await page.request.get('/icons/s-mart-living-v4-192.png');
 expect(await old192.body()).toEqual(await v4_192.body());
 const legacySquare=await page.request.get('/brand/square_icon.png');
 const v4_512=await page.request.get('/icons/s-mart-living-v4-512.png');
 expect(await legacySquare.body()).toEqual(await v4_512.body());
});

test.describe('Public login remains separate from startup icon',()=>{
 test.use({signedIn:false});
 test('login keeps the approved horizontal wordmark on iPhone and Windows',async({page})=>{
  for(const width of [390,1440]){
   await page.setViewportSize({width,height:860});
   await page.goto('/');
   const img=page.getByRole('img',{name:'S-Mart Living',exact:true});
   await expect(img).toBeVisible();
   await expect(img).toHaveAttribute('src','/brand/primary_dark.png');
   await expect(page.locator('head link[rel="icon"]')).toHaveAttribute('href','/icons/s-mart-living-v4-192.png');
  }
 });
});
