shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never;
// 光束：兩片交叉的長條面，橫向 UV 做出白熱核心＋有色外暈，加法混色（HDR，配合 Glow 發光）。
uniform vec3 beam_color : source_color = vec3(1.0, 0.1, 0.25);
uniform float intensity = 6.0;
varying vec2 uv_v;
void vertex() { uv_v = UV; }
void fragment() {
	float core = pow(1.0 - clamp(abs(uv_v.x - 0.5) * 2.0, 0.0, 1.0), 3.0);
	vec3 c = mix(beam_color, vec3(1.0), core * 0.65) * (0.25 + core * 1.5) * intensity;
	ALBEDO = c;
	ALPHA = 1.0;
}
