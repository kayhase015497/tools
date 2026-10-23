shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled;
// 引擎尾焰／飛彈尾跡：沿軸向的長條公告板（繞軸心旋轉，永遠正對鏡頭）。
// MultiMesh 實例的矩陣：第 1 欄＝軸向量（長度＝尾跡長，從尾端指向引擎端）、第 2 欄長度＝寬度、第 4 欄＝中心。顏色＝COLOR。
varying vec4 col;
varying vec2 uvv;
void vertex() {
	col = COLOR;
	uvv = UV;
	vec3 axis = MODEL_MATRIX[0].xyz;
	float w = length(MODEL_MATRIX[1].xyz);
	vec3 c = MODEL_MATRIX[3].xyz;
	vec3 to_cam = normalize(CAMERA_POSITION_WORLD - c);
	vec3 side = normalize(cross(axis, to_cam) + vec3(1e-5)) * w;
	vec3 wp = c + axis * (UV.x - 0.5) + side * (UV.y - 0.5) * 2.0;
	POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(wp, 1.0);
}
void fragment() {
	float along = pow(clamp(uvv.x, 0.0, 1.0), 1.7);          // 引擎端（x=1）最亮，往尾端漸隱
	float across = exp(-pow((uvv.y - 0.5) * 2.0, 2.0) * 5.0);
	float core = pow(clamp(uvv.x, 0.0, 1.0), 5.0) * exp(-pow((uvv.y - 0.5) * 2.0, 2.0) * 14.0);
	ALBEDO = col.rgb * (along * across * 1.6 + core * 2.5);
	ALPHA = clamp(along * across, 0.0, 1.0);
}
