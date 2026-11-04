#!/bin/bash
# 雲端（Linux 沙盒，軟體渲染 lavapipe）截圖測試。用法：
#   godot/tools/cloud_render.sh <out.png> <frames> [遊戲參數...]
# 例： godot/tools/cloud_render.sh /tmp/gd/out/a.png 40 --demo-cam --auto-start=free --bigstep
# 前置（沙盒重置後要重做）：見 docs/space-war/AUDIO-VISUAL-PLAN-2.md「操作手冊」。
GODOT=${GODOT:-/tmp/gd/Godot_v4.7-stable_linux.x86_64}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
out=$1; n=$2; shift 2
tmp=$(mktemp -d)
cd "$ROOT"
VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json xvfb-run -a -s "-screen 0 1280x720x24" \
  "$GODOT" --path . --rendering-driver vulkan --resolution 1280x720 \
  --write-movie "$tmp/f.png" --fixed-fps 20 --quit-after "$n" -- "$@" 2>&1 \
  | grep -E "SCRIPT ERROR|Parse Error|ERROR:" | head -20
last=$(ls "$tmp"/*.png 2>/dev/null | tail -1)
[ -n "$last" ] && cp "$last" "$out" && echo "saved $out ($(ls "$tmp" | wc -l) frames)"
rm -rf "$tmp"
