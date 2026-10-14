const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
(async () => {
  for (const args of [
    ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
    ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--disable-gpu-sandbox'],
  ]) {
    const b = await chromium.launch({ args, headless: true });
    const pg = await b.newPage(); await pg.goto('http://localhost:8765/index.html');
    const r = await pg.evaluate(async () => { if (!navigator.gpu) return 'no navigator.gpu'; try { const a = await navigator.gpu.requestAdapter(); if (!a) return 'adapter null'; const d = await a.requestDevice(); return 'OK ' + (a.info ? a.info.description || a.info.vendor : '') + ' ' + [...a.features].length + ' features'; } catch (e) { return 'ERR ' + e.message; } });
    console.log(args.slice(0, 4).join(' '), '=>', r); await b.close();
  }
})();
