const { chromium } = (() => { try { return require('playwright'); } catch (e) { return require('/opt/node22/lib/node_modules/playwright'); } })();
(async () => {
  const q = process.argv[2] || 'low', page = process.argv[3] || 'space-war-battle-v2';
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 900, height: 500 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' | ' + (e.stack || '').split('\n').slice(0, 3).join(' | '))); pg.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/Failed to load|fonts/.test(m.text())) errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  await pg.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await pg.addInitScript(() => { let s = 123456789; Math.random = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; });
  await pg.goto(`http://localhost:8765/gadget/${page}.html?gov=0&q=${q}`);
  try { await pg.waitForFunction('window.battleDebug && window.battleDebug.ready', null, { timeout: 60000 }); } catch (e) { errs.push('NOT READY'); }
  console.log(errs.slice(0, 12).join('\n') || 'no errors'); await b.close();
})();
