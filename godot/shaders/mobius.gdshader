shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
// 翁法羅斯的莫比烏斯環（移植自網頁版 nodes.js 的 mobiusMaterial）：光帶本體＋外圈光暈，加法混色（HDR，配合泛光）。
// UV.x＝沿帶子的位置 0~1，UV.y＝寬度方向 -1~1。
uniform float halo = 0.0;
uniform float time = 0.0;
varying float vd;
void vertex() {
	vd = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}
void fragment() {
	float a = abs(UV.y);
	float u = UV.x;
	float flow = pow(sin(u * 6.2832 * 7.0 - time * 0.7) * 0.5 + 0.5, 6.0);
	float flow2 = pow(sin(u * 6.2832 * 3.0 + time * 0.35) * 0.5 + 0.5, 4.0);
	float fade = smoothstep(300.0, 2200.0, vd);
	vec3 c;
	if (halo > 0.5) {
		c = vec3(0.45, 0.3, 1.0) * (0.7 + flow2 * 0.5) * exp(-a * a * 2.2) * 0.11 * fade;
	} else {
		float edge = smoothstep(0.9, 0.99, a) + smoothstep(0.6, 0.9, a) * 0.25;
		float core = exp(-a * a * 40.0);
		c = mix(vec3(0.22, 0.2, 0.9), vec3(0.55, 0.3, 0.95), a) * (0.3 + flow2 * 0.35) + vec3(0.9, 1.25, 2.3) * edge * (0.8 + flow * 0.7) + vec3(0.4, 0.3, 0.7) * core * 0.35;
		c *= fade;
	}
	ALBEDO = c;
	ALPHA = 1.0;
}
