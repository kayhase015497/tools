shader_type spatial;
// 鐵墓外殼（Build 25）：網頁版是「壓暗本體＋紅色菲涅爾輪廓光」，這裡再加：
//  • 三平面投影的大面板縫／鱗片紋，凹槽變暗
//  • 沿面板縫流動的暗紅脈動「裂光」（只出現在凹槽附近，隨時間緩慢呼吸）
//  • 雜訊起伏的粗糙度，讓暗金屬有層次
// 沒有任何貼圖，不依賴 UV；細節隨距離淡出，避免遠處閃爍。
uniform vec3 base_color : source_color = vec3(0.35, 0.29, 0.33);
uniform vec3 emit_color : source_color = vec3(0.0);
uniform float emit_energy = 0.0;
uniform float albedo_k = 0.34;
uniform float metallic = 0.2;
uniform float roughness = 0.7;
uniform vec3 rim_color : source_color = vec3(3.0, 0.12, 0.24);
uniform float rim_power = 3.4;
uniform float rim_k = 0.6;
uniform float cell = 3.2;           // 面板邊長（模型單位）
uniform float vein_energy = 0.45;
uniform float detail_dist = 9000.0;
varying vec3 mpos;
varying vec3 mnrm;
varying float vdist;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }

// x: 面板高度（0=縫），y: 面板編號雜訊，z: 縫距（越小越靠近縫中心）
vec3 panel(vec2 p) {
	vec2 q = p / cell;
	vec2 f = abs(fract(q) - 0.5);
	float d = max(f.x, f.y);
	float h = smoothstep(0.5, 0.44, d);
	float seam = 1.0 - smoothstep(0.44, 0.5, d);
	float n = vn(p * 0.35) * 0.6 + vn(p * 1.7) * 0.4;
	return vec3(h, h21(floor(q)) * 0.7 + n * 0.3, seam);
}
vec3 tri(vec3 p, vec3 w) {
	return panel(p.yz) * w.x + panel(p.xz + 11.0) * w.y + panel(p.xy + 23.0) * w.z;
}

void vertex() {
	mpos = VERTEX;
	mnrm = NORMAL;
	vdist = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}

void fragment() {
	vec3 w = pow(abs(normalize(mnrm)), vec3(6.0));
	w /= (w.x + w.y + w.z + 1e-5);
	vec3 t = tri(mpos, w);
	float fade = 1.0 - smoothstep(detail_dist * 0.25, detail_dist, vdist);
	float groove = (1.0 - t.x) * fade;
	float cellv = (t.y - 0.5) * fade;
	vec3 al = base_color * albedo_k * (1.0 + cellv * 0.22) * (1.0 - groove * 0.55);
	ALBEDO = al;
	METALLIC = metallic;
	ROUGHNESS = clamp(roughness + cellv * 0.2 + groove * 0.2, 0.2, 1.0);
	float ndv = clamp(dot(normalize(NORMAL), normalize(VIEW)), 0.0, 1.0);
	float rim = pow(1.0 - ndv, rim_power);
	float pulse = 0.55 + 0.45 * sin(TIME * 0.9 + t.y * 9.0 + mpos.y * 0.04);
	vec3 vein = vec3(1.0, 0.07, 0.16) * t.z * fade * pulse * vein_energy * smoothstep(0.35, 0.75, vn(mpos.xz * 0.5 + mpos.y * 0.3));
	EMISSION = emit_color * emit_energy + rim_color * rim * rim_k + vein;
}
