shader_type spatial;
render_mode unshaded, depth_draw_never, cull_disabled;
// 熱扭曲／衝擊波折射：公告板環，環內的畫面被往外推（取螢幕貼圖偏移取樣）。t 0→1：環向外擴散、強度遞減。
uniform sampler2D screen_tex : hint_screen_texture, filter_linear, repeat_disable;
uniform float t = 0.0;
uniform float strength = 0.02;
varying vec2 uvv;
void vertex() {
	uvv = UV * 2.0 - 1.0;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}
void fragment() {
	float r = length(uvv);
	float ring_r = 0.25 + t * 0.7;
	float ring = exp(-pow((r - ring_r) * 7.0, 2.0)) * (1.0 - t) * smoothstep(1.0, 0.85, r);
	vec2 dir = normalize(uvv + vec2(1e-5));
	vec2 off = dir * ring * strength * (0.6 + 0.4 * sin(r * 40.0 - t * 30.0));
	ALBEDO = textureLod(screen_tex, SCREEN_UV + off, 0.0).rgb;
	ALPHA = clamp(ring * 2.0, 0.0, 1.0);
}
