// 實驗室：獨立測試每個 TSL 元件（用 ?t=名稱 選擇測試）
import * as THREE from 'three/webgpu';
import { Fn, float, vec2, vec3, vec4, uniform, attribute, positionLocal, cameraProjectionMatrix, modelViewMatrix, uv, time, mix, smoothstep, exp, length, pow, texture } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { pass } from 'three/tsl';

const Q = new URLSearchParams(location.search), info = document.getElementById('info');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL: Q.get('gl') === '1' });
await renderer.init();
renderer.setSize(innerWidth, innerHeight, false);
info.textContent = 'backend: ' + (renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2 (fallback)') + '\n';

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000); camera.position.set(0, 0, 8);
scene.add(new THREE.DirectionalLight(0xffffff, 3), new THREE.HemisphereLight(0x9fb4ff, 0x331133, 1));
const box = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4), new THREE.MeshStandardNodeMaterial({ color: 0x4466aa, metalness: 0.6, roughness: 0.4 })); box.rotation.set(0.4, 0.6, 0); scene.add(box);

// 實例化公告板：每個實例自己的位置／大小／顏色（對應 v1 的粒子與光束系統）
const N = 20000, g = new THREE.InstancedBufferGeometry(); const plane = new THREE.PlaneGeometry(1, 1);
g.index = plane.index; g.setAttribute('position', plane.attributes.position); g.setAttribute('uv', plane.attributes.uv);
const pos = new Float32Array(N * 4), col = new Float32Array(N * 3);
for (let i = 0; i < N; i++) { pos.set([Math.random() * 40 - 20, Math.random() * 20 - 10, Math.random() * 20 - 10, 0.05 + Math.random() * 0.25], i * 4); col.set([Math.random() * 3, Math.random() * 3, 3], i * 3); }
g.setAttribute('aP', new THREE.InstancedBufferAttribute(pos, 4)); g.setAttribute('aC', new THREE.InstancedBufferAttribute(col, 3)); g.instanceCount = N;
const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const aP = attribute('aP', 'vec4'), aC = attribute('aC', 'vec3');
m.vertexNode = Fn(() => { const mv = modelViewMatrix.mul(vec4(aP.xyz, 1.0)).toVar(); mv.xy.addAssign(positionLocal.xy.mul(aP.w)); return cameraProjectionMatrix.mul(mv); })();
m.colorNode = Fn(() => { const d = length(uv().sub(0.5)); const a = smoothstep(0.5, 0.0, d); return vec4(aC.mul(a.mul(a)), 1.0); })();
const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);

const rp = new THREE.RenderPipeline(renderer); const sp = pass(scene, camera); rp.outputNode = sp.getTextureNode('output').add(bloom(sp.getTextureNode('output'), 0.6, 0.5, 1.0));
let n = 0, t0 = performance.now();
renderer.setAnimationLoop(() => { box.rotation.y += 0.01; rp.render(); n++; if (n === 30) { info.textContent += `30 frames in ${((performance.now() - t0) / 1000).toFixed(1)} s · instances ${N}\nREADY`; window.__ready = true; } });
