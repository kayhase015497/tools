shader_type spatial;
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
uniform float wood = 0.0;               // 1＝檜木質感（仙舟巡洋艦）：程序式木紋取代原底色，原底色的藍色飾帶改成淡螢光
uniform float ceramic = 0.0;            // 1＝白色耐高溫陶瓷（黑塔空間站）：提亮、釉面清漆
uniform vec3 trim_glow : source_color = vec3(0.45, 0.9, 0.85);
uniform float trim_energy = 0.5;
uniform float burn_override = 0.0;      // 斷面燃燒度（腳本以 Tween 由 1 降到 0）
uniform vec3 ember_color : source_color = vec3(1.0, 0.28, 0.05);   // 聯軍橘、軍團紫
uniform float ember_gain = 2.5;

varying vec3 mpos;
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

float h31(vec3 p) { p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
		mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
// 檜木紋理（只提供「紋理起伏」，不改顏色）：沿船身長軸（模型 Z）的細直紋；年輪由 (x,y) 同心環加噪聲扭曲，淡黃褐色，偶有深色節疤與長條亮紋
float wood_grain(vec3 p) {
	vec3 q = vec3(p.x * 0.9, p.y * 0.9, p.z * 0.06);
	float warp = vn3(q * vec3(2.5, 2.5, 0.8)) * 0.9 + vn3(q * vec3(9.0, 9.0, 1.6)) * 0.25;
	float rings = fract((length(q.xy) + warp) * 7.0);
	float grain = smoothstep(0.0, 0.35, rings) * (1.0 - smoothstep(0.65, 1.0, rings));
	float fine = vn3(vec3(p.x * 30.0, p.y * 30.0, p.z * 0.7));
	float knot = smoothstep(0.78, 0.92, vn3(vec3(p.x * 1.2, p.y * 1.2, p.z * 0.12) + 9.0));
	return clamp(grain * 0.75 + fine * 0.25 - knot * 0.5, 0.0, 1.0);
}

void vertex() {
	mpos = VERTEX;
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
	float trim_mask = 0.0;
	float grain = 0.5;
	if (wood > 0.0) {   // 檜木質感＝木紋的凹凸（法線、粗糙度、微弱明暗），顏色保留原本的深色與紅色；偏藍的飾帶 → 淡螢光
		float bl = base.b - max(base.r, base.g * 0.8);
		trim_mask = smoothstep(0.04, 0.16, bl) * smoothstep(0.25, 0.45, base.b);
		grain = wood_grain(mpos);
		base.rgb *= mix(1.0, 0.72 + 0.5 * grain, wood * (1.0 - trim_mask));
		base.rgb = mix(base.rgb, vec3(0.3, 0.45, 0.46), trim_mask * wood);
		depth = clamp(depth + (1.0 - grain) * 0.35 * wood * (1.0 - trim_mask), 0.0, 1.0);   // 木紋凹槽加進高度場 → 法線凹凸
	}
	if (ceramic > 0.0) {   // 白色高溫陶瓷：把底色拉向暖白，保留一點明暗（接縫、塗裝）
		float l2 = dot(base.rgb, vec3(0.3, 0.59, 0.11));
		vec3 cer = vec3(0.9, 0.9, 0.87) * (0.8 + 0.35 * l2);
		base.rgb = mix(base.rgb, cer, ceramic);
	}
	float curv = 0.5 - depth;   // >0 凸緣、<0 凹處
	vec3 albedo = base.rgb * shade;
	albedo = mix(albedo, albedo * vec3(0.55, 0.52, 0.5), clamp(depth * wear * 1.3, 0.0, 0.7));        // 凹處髒汙（偏暗偏暖灰）
	albedo += vec3(0.05, 0.05, 0.055) * clamp(curv * 3.0, 0.0, 1.0) * wear;                              // 凸緣磨亮
	ALBEDO = albedo;
	float rgh = use_rough_tex ? texture(rough_tex, uv).r * roughness * 1.6 : roughness;
	ROUGHNESS = clamp(rgh + depth * 0.25 * wear, 0.12, 1.0);
	if (wood > 0.0) ROUGHNESS = mix(ROUGHNESS, 0.38 + 0.3 * (1.0 - grain), wood * (1.0 - trim_mask));
	if (ceramic > 0.0) { ROUGHNESS = mix(ROUGHNESS, 0.32 + depth * 0.4, ceramic); CLEARCOAT = ceramic * 0.85; CLEARCOAT_ROUGHNESS = 0.12; }
	METALLIC = clamp(metallic + clamp(curv * 2.0, 0.0, 1.0) * 0.2 * wear, 0.0, 1.0);
	METALLIC = mix(METALLIC, 0.0, max(wood, ceramic));   // 木頭與陶瓷都是非金屬
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
	em += trim_glow * trim_energy * trim_mask * wood;
	// 燃燒餘燼（斷面用；burn>0 時凹處透出橘紅光，隨時間閃動）
	float flick = 0.7 + 0.3 * sin(TIME * 3.1 + seed * 11.0 + depth * 25.0);
	vec3 ember = ember_color * pow(depth, 1.3) * clamp(burn, 0.0, 1.0) * ember_gain * flick;
	EMISSION = em + ember;
}
