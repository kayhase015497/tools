shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled;
// 濃煙（Squadron 42 風）：近黑的「花椰菜雲」。用高度場算出假法線，做出圓鼓鼓的團塊與暗心亮邊；
// 火光只染「朝向爆炸中心」的那一側（隨距離與壽命衰減）；內有紅橘餘燼光點。
uniform vec3 smoke_color : source_color = vec3(0.012, 0.011, 0.013);
uniform vec3 fire_color : source_color = vec3(1.0, 0.38, 0.09);
uniform vec3 key_color : source_color = vec3(0.30, 0.33, 0.42);
uniform vec3 fire_color2 : source_color = vec3(0.62, 0.25, 1.0);
uniform float shift = 0.0;   // 冷色主光／環境光打在煙的受光面
uniform vec3 center = vec3(0.0);                                   // 爆炸中心（世界座標）
uniform float radius = 100.0;                                      // 火光影響半徑
uniform float fire_glow = 1.0;
varying float age;
varying float seed;
varying vec2 ldir_v;
varying float dist_k;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float height(vec2 q, float r) { return smoothstep(0.18, 0.7, fbm(q) * 1.15 + (1.0 - r) * 0.6); }

void vertex() {
	age = INSTANCE_CUSTOM.y;
	seed = float(INSTANCE_ID) * 3.17 + INSTANCE_CUSTOM.x;
	vec3 wp = MODEL_MATRIX[3].xyz;
	vec3 to_c = center - wp;
	float d = length(to_c);
	dist_k = exp(-d / max(radius, 1.0));
	vec3 ld = d > 0.001 ? to_c / d : vec3(0.0, 1.0, 0.0);
	ldir_v = (VIEW_MATRIX * vec4(ld, 0.0)).xy;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float r = length(uv);
	if (r > 1.0) discard;
	vec2 q = uv * 1.5 + vec2(seed, seed * 0.61) + vec2(0.0, -age * 0.4);
	float h = height(q, r);
	float e = 0.06;
	vec2 g = vec2(height(q + vec2(e, 0.0), r) - height(q - vec2(e, 0.0), r), height(q + vec2(0.0, e), r) - height(q - vec2(0.0, e), r)) / (2.0 * e);
	vec3 n = normalize(vec3(-g * 0.9, 1.0));
	float r2 = r + (fbm(q * 1.9 + 5.0) - 0.5) * 0.7;               // 用噪聲侵蝕輪廓：不再是規則圓盤，而是凹凸的積雲邊緣
	float edge = smoothstep(1.0, 0.45, r2);
	// 濃：高度場拉高後夾到 1（團塊核心完全不透明，只有邊緣半透明），壽命前 60% 幾乎不淡出
	float a = clamp(h * 2.0, 0.0, 1.0) * edge * smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.6, 1.0, age));
	if (a < 0.015) discard;
	float facing_fire = clamp(dot(n, normalize(vec3(ldir_v, 0.55))), 0.0, 1.0);          // 朝向爆炸中心的面
	// 時間軸：前期火光強（濃煙中帶火光）→ 後期以濃煙為主、火光為輔（Squad 爆炸）
	float fire_t = pow(clamp(1.0 - age * 3.2, 0.0, 1.0), 1.6) * 1.15 + 0.12 * pow(clamp(1.0 - age, 0.0, 1.0), 4.0);
	float fire = pow(facing_fire, 1.8) * fire_t * dist_k * fire_glow * 0.55;
	float facing_key = clamp(dot(n, normalize(vec3(-0.45, 0.65, 0.6))), 0.0, 1.0);        // 冷色主光（左上）
	float ao = 0.35 + 0.65 * smoothstep(0.0, 0.9, r);                                      // 團塊中心較暗（自遮蔽）
	float ember = smoothstep(0.88, 0.96, vn(q * 8.0 + age * 2.0)) * (1.0 - age) * 2.0 * (0.4 + dist_k);
	vec3 fcol = mix(fire_color, fire_color2, shift * smoothstep(0.1, 0.4, age));
	vec3 col = smoke_color * (0.8 + 1.2 * h) * ao + key_color * pow(facing_key, 2.2) * 0.42 * smoothstep(0.0, 0.12, age) + fcol * fire + mix(vec3(1.0, 0.32, 0.06), fire_color2, shift * smoothstep(0.1, 0.4, age)) * ember;
	ALBEDO = col;
	ALPHA = a;
}
