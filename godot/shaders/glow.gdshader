shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
// 引擎光暈：柔光暈＋亮核心，加法混色（HDR，配合泛光）。實例顏色（COLOR）決定色調；MultiMesh 實例的縮放決定大小。
varying vec4 col;
void vertex() {
	col = COLOR;
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0, 0, 0), vec4(0, length(MODEL_MATRIX[1].xyz), 0, 0), vec4(0, 0, length(MODEL_MATRIX[2].xyz), 0), vec4(0, 0, 0, 1));
}
void fragment() {
	vec2 uv = UV * 2.0 - 1.0;
	float d = length(uv);
	if (d > 1.0) discard;
	float halo = exp(-d * d * 5.0);
	float core = exp(-d * d * 38.0);
	ALBEDO = col.rgb * (halo * 1.4 + core * 3.0);
	ALPHA = halo;
}
