shader_type canvas_item;
// 影片顆粒感＋輕微暗角（全螢幕）。強度很低，只是讓大面積純色（艦體、星空）不顯得「數位乾淨」。
uniform sampler2D screen_tex : hint_screen_texture, filter_linear, repeat_disable;
uniform float grain = 0.035;
uniform float vignette = 0.22;
float hash(vec2 p) {
	p = fract(p * vec2(443.897, 441.423));
	p += dot(p, p.yx + 19.19);
	return fract((p.x + p.y) * p.x);
}
void fragment() {
	vec3 c = texture(screen_tex, SCREEN_UV).rgb;
	float n = hash(FRAGCOORD.xy + fract(TIME) * 713.0) - 0.5;
	float lum = dot(c, vec3(0.299, 0.587, 0.114));
	c += n * grain * (1.0 - 0.6 * lum);   // 暗處顆粒略明顯，亮處少一些
	vec2 q = SCREEN_UV - 0.5;
	c *= 1.0 - vignette * dot(q, q) * 2.2;
	COLOR = vec4(c, 1.0);
}
