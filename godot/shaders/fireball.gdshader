shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
// 爆炸火團（Squadron 42 風）：花椰菜狀的泡泡團——中心黃白過曝、外緣橘紅，表面有顆粒與縫隙；粒子壽命（INSTANCE_CUSTOM.y）決定漸暗與縮小。
uniform float intensity = 2.1;
varying float age;
varying float seed;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }

void vertex() {
	age = INSTANCE_CUSTOM.y;
	seed = float(INSTANCE_ID) * 7.31 + INSTANCE_CUSTOM.x;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}

void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float r = length(uv);
	if (r > 1.0) discard;
	vec2 q = uv * 1.6 + vec2(seed, seed * 0.37);
	float n = fbm(q + vec2(0.0, -age * 1.6));
	float n2 = fbm(q * 2.3 - age * 1.1 + 4.0);
	float bubbles = smoothstep(0.35, 0.75, n * 0.85 + n2 * 0.45);      // 泡泡團的顆粒感
	float core = 1.0 - r;
	float dens = smoothstep(0.0, 0.45, bubbles * 0.9 + core * 1.25 - 0.55 - age * 0.75);
	if (dens < 0.01) discard;
	float heat = clamp(core * 1.2 + n * 0.6 - age * 1.25, 0.0, 1.0);
	vec3 cool = vec3(0.55, 0.1, 0.04), mid = vec3(1.0, 0.42, 0.08), hot = vec3(1.0, 0.92, 0.7) * 2.2;
	vec3 col = mix(cool, mid, smoothstep(0.1, 0.55, heat));
	col = mix(col, hot, smoothstep(0.62, 1.0, heat));
	float fade = pow(clamp(1.0 - age, 0.0, 1.0), 1.4);
	ALBEDO = col * dens * fade * intensity;
	ALPHA = dens * fade;
}
