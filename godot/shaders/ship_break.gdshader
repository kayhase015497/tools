shader_type spatial;
render_mode cull_disabled;   // 斷面：雙面渲染（斷面法線方向不保證朝外）
// 艦體材質（視差遮蔽貼圖 POM 全面升級版）：
//  • 高度圖由底色貼圖推導（tools-src/godot/make_heightmaps.py）：面板接縫與凹槽真的「凹進去」，視角改變有視差與遮擋
//  • POM 步數隨距離遞減（近 20 層 → 遠 0 層），超過 lod_distance 直接略過；並做「自遮蔭」讓凹槽內側變暗
//  • 高度場導數擾動法線（光照下的細微凹凸）＋ 凹處髒汙／凸緣磨亮（粗糙度、金屬度、亮度調整）
//  • 若模型本身有法線貼圖就疊加；有自發光貼圖就照用（受 emission_energy 控制）
//  • INSTANCE_CUSTOM.x ＝ 燃燒度 0~1（斷裂後斷面燃燒餘燼用；目前為 0），INSTANCE_CUSTOM.y ＝ 亂數種子
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform vec4 albedo_color : source_color = vec4(1.0);
uniform sampler2D height_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
uniform sampler2D rough_tex : hint_default_white, filter_linear_mipmap, repeat_enable;
uniform bool use_rough_tex = false;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap, repeat_enable;
uniform bool use_normal_tex = false;
uniform sampler2D emission_tex : source_color, filter_linear_mipmap, repeat_enable;
uniform bool use_emission_tex = false;
uniform vec3 emission_color : source_color = vec3(0.0);
uniform float emission_energy = 1.0;
uniform float roughness = 0.6;
uniform float metallic = 0.5;
uniform float parallax_depth = 0.035;   // UV 空間的最大深度
uniform float lod_distance = 3200.0;
uniform float bump_strength = 1.2;
uniform float wear = 0.55;              // 凹處髒汙／凸緣磨亮強度
uniform float pom_max_steps = 20.0;
uniform float burn_override = 0.0;      // 斷面燃燒度（腳本以 Tween 由 1 降到 0）
uniform vec3 ember_color : source_color = vec3(1.0, 0.28, 0.05);   // 聯軍橘、軍團紫
uniform float ember_gain = 2.5;

varying float burn;
varying float seed;
varying float vdist;

mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv) {
	vec3 dp1 = dFdx(p), dp2 = dFdy(p);
	vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
	vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
	vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
	vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
	float invmax = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
	return mat3(T * invmax, B * invmax, N);
}

float hgt(vec2 uv) { return 1.0 - textureLod(height_tex, uv, 0.0).r; }   // 0＝表面，1＝最深（圖上黑＝凹）

void vertex() {
	burn = INSTANCE_CUSTOM.x + burn_override;
	seed = INSTANCE_CUSTOM.y;
	vdist = -(MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).z;
}

void fragment() {
	vec2 uv = UV;
	float depth = 1.0 - texture(height_tex, uv).r;
	float shade = 1.0;
	if (vdist < lod_distance) {
		float fade = 1.0 - smoothstep(lod_distance * 0.35, lod_distance, vdist);
		mat3 tbn = cotangent_frame(NORMAL, VERTEX, UV);
		vec3 V = normalize(-VERTEX);
		vec3 vts = vec3(dot(V, tbn[0]), dot(V, tbn[1]), dot(V, tbn[2]));
		float layers = mix(4.0, pom_max_steps, clamp(abs(vts.z), 0.0, 1.0) * fade);
		layers = max(floor(layers * fade + 0.5), 1.0);
		float layer_depth = 1.0 / layers;
		vec2 duv = (vts.xy / max(vts.z, 0.3)) * parallax_depth * fade / layers;
		float cur = 0.0;
		vec2 cuv = uv;
		float dv = hgt(cuv);
		for (int i = 0; i < 24; i++) {
			if (float(i) >= layers || cur >= dv) break;
			cuv -= duv;
			dv = hgt(cuv);
			cur += layer_depth;
		}
		vec2 prev = cuv + duv;
		float after = dv - cur;
		float before = hgt(prev) - (cur - layer_depth);
		float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
		uv = mix(cuv, prev, w);
		depth = hgt(uv);
		// 自遮蔭：凹槽越深越暗（簡化的環境遮蔽）
		shade = 1.0 - clamp(depth * 0.55 * wear * 1.6, 0.0, 0.5) * fade;
	}
	vec4 base = texture(albedo_tex, uv) * albedo_color;
	float curv = 0.5 - depth;   // >0 凸緣、<0 凹處
	vec3 albedo = base.rgb * shade;
	albedo = mix(albedo, albedo * vec3(0.55, 0.52, 0.5), clamp(depth * wear * 1.3, 0.0, 0.7));        // 凹處髒汙（偏暗偏暖灰）
	albedo += vec3(0.05, 0.05, 0.055) * clamp(curv * 3.0, 0.0, 1.0) * wear;                              // 凸緣磨亮
	ALBEDO = albedo;
	float rgh = use_rough_tex ? texture(rough_tex, uv).r * roughness * 1.6 : roughness;
	ROUGHNESS = clamp(rgh + depth * 0.25 * wear, 0.12, 1.0);
	METALLIC = clamp(metallic + clamp(curv * 2.0, 0.0, 1.0) * 0.2 * wear, 0.0, 1.0);
	// 法線：高度場導數 ＋（若有）模型法線貼圖
	vec3 N = NORMAL;
	if (use_normal_tex) {
		vec3 nm = texture(normal_tex, uv).xyz * 2.0 - 1.0;
		mat3 tbn2 = cotangent_frame(NORMAL, VERTEX, UV);
		N = normalize(tbn2 * vec3(nm.xy, max(nm.z, 0.2)));
	}
	vec3 dpdx = dFdx(VERTEX), dpdy = dFdy(VERTEX);
	vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
	float det = dot(dpdx, r1);
	vec3 sg = sign(det) * (dFdx(depth) * r1 + dFdy(depth) * r2);
	NORMAL = normalize(abs(det) * N - bump_strength * sg);
	// 發光
	vec3 em = use_emission_tex ? texture(emission_tex, uv).rgb * emission_energy : emission_color * emission_energy;
	// 熔融斷面：白橘熱點（高頻噪聲尖峰）＋沿凹槽的暗紅餘燼＋整體呼吸；burn 1→0 慢慢冷卻（亮度、熱點數量一起降）
	float t = TIME;
	float hot = smoothstep(0.72 - 0.35 * burn, 0.95, fract(sin(dot(floor(uv * 38.0 + t * 0.15), vec2(12.9898, 78.233))) * 43758.5453) * 0.55 + depth * 0.55);
	float flick = 0.7 + 0.3 * sin(t * 3.1 + seed * 11.0 + depth * 25.0);
	float b = clamp(burn, 0.0, 1.0);
	vec3 glow = ember_color * (pow(depth, 1.1) * 1.8 + 0.25) * b * ember_gain * flick;
	vec3 core = mix(ember_color, vec3(1.0, 0.95, 0.8), 0.6) * hot * b * ember_gain * 2.2;
	EMISSION = em + glow + core;
}
