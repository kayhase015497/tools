shader_type spatial;
// 艦體損傷（視差遮蔽貼圖 Parallax Occlusion Mapping）：
//  • 每艘艦的損傷度來自 MultiMesh 的 INSTANCE_CUSTOM.x（0~1），INSTANCE_CUSTOM.y 是亂數種子
//  • 程序式「裂縫＋燒蝕坑」深度場（Voronoi 邊緣＋噪聲），範圍隨損傷度擴大 → 用 POM 讓裂縫真的「凹進去」，視角改變時有視差與遮擋
//  • 凹陷處露出燒紅的熔岩光（自發光，隨時間脈動）、周圍焦黑、粗糙度上升；用深度場的螢幕空間導數擾動法線，光照下有凹凸
//  • 遠處（>lod_distance）或未受損時略過 POM，只做廉價的焦黑
//  Godot 目前沒有硬體曲面細分（Tessellation）著色器，所以採用 POM；若之後需要真實幾何位移，可改用高面數網格＋頂點位移。
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform bool use_albedo_tex = true;
uniform sampler2D emission_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_emission_tex = false;
uniform vec3 emission_color : source_color = vec3(0.0);
uniform float emission_energy = 1.0;
uniform float roughness = 0.6;
uniform float metallic = 0.0;
uniform float parallax_depth = 0.06;
uniform int parallax_steps = 14;
uniform float crack_scale = 7.0;
uniform float lod_distance = 2600.0;
uniform float bump_scale = 3.0;   // 凹陷的世界尺度深度（單位：與艦體同單位）

varying float dmg;
varying float seed;
varying float vdist;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
vec2 hash22(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float vor_edge(vec2 x) {   // 到最近 Voronoi 邊界的距離（0 在裂縫線上）
	vec2 n = floor(x), f = fract(x);
	float d1 = 8.0, d2 = 8.0;
	for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
		vec2 g = vec2(float(i), float(j));
		vec2 r = g + hash22(n + g) - f;
		float d = dot(r, r);
		if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
	}
	return sqrt(d2) - sqrt(d1);
}
float damage_region(vec2 uv, float d) { return smoothstep(1.0 - d, 1.0 - d + 0.18, fbm(uv * 2.2 + seed)); }   // 受損區域：損傷度越高範圍越大
float depth_at(vec2 uv, float d) {   // 0＝表面，1＝最深
	vec2 p = uv * crack_scale + seed * 13.0;
	float e = vor_edge(p + (fbm(p * 1.3) - 0.5) * 0.6);
	float crack = 1.0 - smoothstep(0.0, 0.12, e);
	float pit = smoothstep(0.55, 0.85, fbm(uv * 9.0 + seed * 3.0)) * 0.6;
	return clamp(crack + pit, 0.0, 1.0) * damage_region(uv, d);
}
mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv) {
	vec3 dp1 = dFdx(p), dp2 = dFdy(p);
	vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
	vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
	float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
	return mat3(T * invmax, B * invmax, N);
}

void vertex() {
	dmg = INSTANCE_CUSTOM.x;
	seed = INSTANCE_CUSTOM.y;
	vdist = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}

void fragment() {
	vec2 uv = UV;
	float d = clamp(dmg, 0.0, 1.0);
	float depth = 0.0;
	if (d > 0.02) {
		if (vdist < lod_distance) {
			// POM：沿視線方向逐層步進，找到射線與深度場相交的位置
			mat3 tbn = cotangent_frame(NORMAL, VERTEX, UV);
			vec3 V = normalize(-VERTEX);
			vec3 vts = vec3(dot(V, tbn[0]), dot(V, tbn[1]), dot(V, tbn[2]));
			float layers = float(parallax_steps);
			float layer_depth = 1.0 / layers;
			vec2 duv = (vts.xy / max(vts.z, 0.25)) * parallax_depth / layers;
			float cur = 0.0;
			vec2 cuv = uv;
			float dv = depth_at(cuv, d);
			for (int i = 0; i < 24; i++) {
				if (i >= parallax_steps || cur >= dv) break;
				cuv -= duv;
				dv = depth_at(cuv, d);
				cur += layer_depth;
			}
			vec2 prev = cuv + duv;
			float after = dv - cur;
			float before = depth_at(prev, d) - (cur - layer_depth);
			float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
			uv = mix(cuv, prev, w);
		}
		depth = depth_at(uv, d);
	}
	vec4 base = use_albedo_tex ? texture(albedo_tex, uv) * albedo_color : albedo_color;
	float region = d > 0.02 ? damage_region(uv, d) : 0.0;
	float scorch = clamp(region * 0.85 + depth * 0.5, 0.0, 1.0) * clamp(d * 1.6, 0.0, 1.0);
	vec3 soot = vec3(0.018, 0.017, 0.02);
	ALBEDO = mix(base.rgb, soot, scorch);
	ROUGHNESS = mix(roughness, 0.95, scorch);
	METALLIC = mix(metallic, 0.2, scorch);
	if (d > 0.02) {   // 用深度場的螢幕空間導數擾動法線（凹凸隨光照變化）
		vec3 dpdx = dFdx(VERTEX), dpdy = dFdy(VERTEX);
		vec3 r1 = cross(dpdy, NORMAL), r2 = cross(NORMAL, dpdx);
		float det = dot(dpdx, r1);
		vec3 sg = sign(det) * (dFdx(depth) * r1 + dFdy(depth) * r2);
		NORMAL = normalize(abs(det) * NORMAL - bump_scale * sg);
	}
	// 熔岩光：凹陷處最亮，隨時間脈動；損傷度 0.25 以上才開始出現
	float gate = clamp((d - 0.25) * 2.2, 0.0, 1.0);
	float pulse = 0.75 + 0.25 * sin(TIME * 2.2 + seed * 17.0);
	vec3 lava = vec3(1.0, 0.27, 0.05) * pow(depth, 1.4) * gate * (1.4 + 1.4 * pulse);
	vec3 base_em = use_emission_tex ? texture(emission_tex, uv).rgb * emission_energy : emission_color * emission_energy;
	float flicker = 1.0 - d * 0.55 * step(0.5, fract(TIME * 3.0 + seed * 7.0));   // 受損艦的燈光閃爍
	EMISSION = base_em * flicker * (1.0 - scorch * 0.6) + lava;
}
