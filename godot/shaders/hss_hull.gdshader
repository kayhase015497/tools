shader_type spatial;
// 黑塔空間站（HSS）近距離細節：保留 GLB 的底色／法線／自發光貼圖，另外以「模型座標的三平面投影」疊上
//  • 大小兩層面板縫（凹槽變暗、有凹凸）＋ 每塊面板各自的明暗／粗糙度差異
//  • 細微刮痕與磨損（程序式，隨距離淡出，不產生閃爍）
// 不需要額外貼圖，也不依賴 UV 展開（TRIPO 的 UV 拉伸不影響細節密度）。
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D emission_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform float normal_scale = 1.0;
uniform float metallic = 0.3;
uniform float roughness = 0.5;
uniform float clearcoat = 0.5;
uniform float emission_energy = 1.0;
uniform float albedo_mul = 1.0;
uniform float cell_big = 0.55;      // 大面板邊長（模型單位；整艦長約 77，1 單位≈26 m）
uniform float cell_small = 0.14;    // 小面板
uniform float detail_bump = 1.0;
uniform float detail_dist = 5200.0; // 超過這個距離（公尺）細節淡出
varying vec3 mpos;
varying vec3 mnrm;
varying float vdist;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }

// 單一平面上的面板高度（0＝凹槽，1＝面板面）與面板編號雜訊
vec2 panel(vec2 p) {
	vec2 pb = p / cell_big, ps = p / cell_small;
	vec2 fb = abs(fract(pb) - 0.5), fs = abs(fract(ps) - 0.5);
	float gb = smoothstep(0.485, 0.45, max(fb.x, fb.y));   // 大縫（較寬）
	float gs = smoothstep(0.49, 0.465, max(fs.x, fs.y));   // 小縫（較淺）
	float scr = smoothstep(0.62, 0.9, vn(p * vec2(38.0, 3.0) + 7.0)) * 0.25 + smoothstep(0.65, 0.95, vn(p * vec2(4.0, 41.0) + 3.0)) * 0.2;   // 細長刮痕
	float h = gb * (0.55 + 0.45 * gs) - scr * 0.6;
	return vec2(h, h21(floor(ps)) * 0.6 + h21(floor(pb) + 17.0) * 0.4);
}

vec2 tri(vec3 p, vec3 w) {
	vec2 a = panel(p.yz), b = panel(p.xz + 11.0), c = panel(p.xy + 23.0);
	return a * w.x + b * w.y + c * w.z;
}

void vertex() {
	mpos = VERTEX;
	mnrm = NORMAL;
	vdist = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}

void fragment() {
	vec4 al = texture(albedo_tex, UV);
	vec3 w = pow(abs(normalize(mnrm)), vec3(6.0));
	w /= (w.x + w.y + w.z + 1e-5);
	vec2 hp = tri(mpos, w);
	float fade = 1.0 - smoothstep(detail_dist * 0.3, detail_dist, vdist);
	float h = hp.x;
	// 凹凸（螢幕空間導數法）
	vec3 dpdx = dFdx(VERTEX), dpdy = dFdy(VERTEX);
	float dhx = dFdx(h), dhy = dFdy(h);
	vec3 r1 = cross(dpdy, NORMAL), r2 = cross(NORMAL, dpdx);
	float det = dot(dpdx, r1);
	vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
	float bs = detail_bump * fade * 0.015 * 600.0 / max(vdist, 60.0);
	NORMAL = normalize(abs(det) * NORMAL - bs * grad);
	NORMAL_MAP = texture(normal_tex, UV).rgb;
	NORMAL_MAP_DEPTH = normal_scale;
	float groove = (1.0 - h) * fade;
	float cellv = (hp.y - 0.5) * fade;
	ALBEDO = al.rgb * albedo_mul * (1.0 + cellv * 0.28) * (1.0 - groove * 0.32);
	ROUGHNESS = clamp(roughness + cellv * 0.22 + groove * 0.2, 0.15, 1.0);
	METALLIC = metallic;
	CLEARCOAT = clearcoat;
	CLEARCOAT_ROUGHNESS = 0.25;
	EMISSION = texture(emission_tex, UV).rgb * emission_energy;
}
