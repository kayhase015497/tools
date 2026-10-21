shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never;
// 衝擊波球殼：菲涅耳亮邊（邊緣亮、正面近乎透明），加法混色，alpha 隨時間遞減。
uniform vec3 wave_color : source_color = vec3(2.6, 0.6, 0.9);
uniform float alpha = 0.9;
void fragment() {
	float f = pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), 2.2);
	ALBEDO = wave_color * (0.05 + f * 1.6) * alpha;
	ALPHA = clamp((0.05 + f) * alpha, 0.0, 1.0);
}
