shader_type canvas_item;
// 後製（畫面最後一道）：調色（冷藍灰陰影＋暖高光的分離色調、輕 S 曲線、飽和度）、輕微色差（徑向）、橫向鏡頭光芒（亮部沿水平方向拖出藍白光條）、暗角。
uniform sampler2D screen_tex : hint_screen_texture, filter_linear, repeat_disable;
uniform float grade = 1.0;     // 調色強度 0~1
uniform float ca = 0.35;       // 色差 0~1
uniform float streak = 0.5;    // 鏡頭光芒 0~1
uniform float vignette = 0.25; // 暗角 0~1

vec3 grade_color(vec3 c) {
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	vec3 shadow_tint = vec3(0.90, 0.97, 1.12);     // 陰影偏冷藍
	vec3 high_tint = vec3(1.06, 1.0, 0.93);        // 高光偏暖
	vec3 tint = mix(shadow_tint, high_tint, smoothstep(0.1, 0.85, l));
	vec3 g = c * tint;
	g = mix(vec3(l), g, 1.06);                      // 微飽和
	g = g + (g - 0.5) * 0.12 * (1.0 - abs(g - 0.5) * 2.0);   // 輕 S 曲線（只動中間調）
	return mix(c, g, grade);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 d = uv - 0.5;
	float r2 = dot(d, d);
	vec2 off = d * ca * 0.006 * (0.4 + r2 * 4.0);   // 邊緣色差較大
	vec3 col;
	col.r = texture(screen_tex, uv + off).r;
	col.g = texture(screen_tex, uv).g;
	col.b = texture(screen_tex, uv - off).b;
	if (streak > 0.01) {
		vec3 acc = vec3(0.0);
		float wsum = 0.0;
		for (int i = -10; i <= 10; i++) {
			if (i == 0) { continue; }
			float fi = float(i);
			float w = exp(-fi * fi * 0.045);
			vec3 s = textureLod(screen_tex, uv + vec2(fi * 0.012, 0.0), 0.0).rgb;
			float lum = dot(s, vec3(0.299, 0.587, 0.114));
			acc += s * smoothstep(0.82, 1.0, lum) * w;
			wsum += w;
		}
		col += acc / wsum * vec3(0.55, 0.8, 1.2) * streak * 1.4;   // 藍白光條
	}
	col = grade_color(col);
	col *= 1.0 - vignette * smoothstep(0.1, 0.75, r2 * 2.2);
	COLOR = vec4(col, 1.0);
}
