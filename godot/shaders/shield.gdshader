shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
// 護盾泡：球殼菲涅耳亮邊＋命中點向外擴散的漣漪＋命中處熱斑；age 0→1 淡出。
uniform vec3 hit_dir = vec3(0.0, 0.0, 1.0);   // 世界座標，由球心指向命中點
uniform float age = 0.0;
uniform vec3 shield_color : source_color = vec3(0.4, 0.7, 1.0);
uniform float power = 1.0;
varying vec3 wn;
void vertex() {
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}
void fragment() {
	float f = pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), 2.5);
	float ang = acos(clamp(dot(normalize(wn), normalize(hit_dir)), -1.0, 1.0));
	float ring = exp(-pow((ang - age * 2.4) * 5.5, 2.0));
	float hot = exp(-ang * ang * 4.0) * (1.0 - age);
	float a = (f * 0.45 + ring * 0.9 + hot * 0.8) * (1.0 - age) * power;
	ALBEDO = shield_color * a * 2.0;
	ALPHA = clamp(a, 0.0, 1.0);
}
