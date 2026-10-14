const { chromium } = require('/opt/node22/lib/node_modules/playwright'); const fs = require('fs');
(async () => {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-features=Vulkan,UseSkiaRenderer', '--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-vulkan=swiftshader', '--disable-vulkan-fallback-to-gl-for-testing', '--enable-features=Vulkan', '--disable-features=VizDisplayCompositor', '--no-sandbox', '--ignore-gpu-blocklist', '--disable-gpu-sandbox', '--disable-gpu-watchdog'];
  const b = await chromium.launch({ args, headless: true }); const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; pg.on('console', m => { if (['error', 'warning'].includes(m.type())) errs.push(m.text().slice(0, 150)); }); pg.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 150)));
  await pg.addInitScript(() => { if (window.GPUTexture) { const o = GPUTexture.prototype.createView; GPUTexture.prototype.createView = function (d) { if (d && d.swizzle) { d = Object.assign({}, d); delete d.swizzle; } return o.call(this, d); }; } });
  await pg.goto('http://localhost:8765/gadget/space-war-lab-v2.html');
  await pg.waitForFunction('window.__ready', null, { timeout: 60000 });
  const d = await pg.evaluate(() => window.__snap());
  fs.writeFileSync('lab4.png', Buffer.from(d.split(',')[1], 'base64')); console.log(errs.slice(0, 4).join('\n') || 'no errors'); await b.close();
})();
