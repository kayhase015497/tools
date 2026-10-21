#!/bin/sh
# 把網頁版的 GLB 艦艇模型同步到 Godot 專案（assets/space-war/models → godot/assets/models）。用法：sh tools-src/godot/sync_models.sh
# 注意：cruiser（廟宇艦橋）、ipc（方正化）、hss（程序式重建）是 Godot 專用版，不同步，以免被網頁版覆蓋；
#       它們由 tools-src/blender/space-war/{cruiser_temple,ipc_boxify,hss_build}.py 產生。
for m in frigate fighter ipc_fighter ipc_sid whale xzd irontomb moon; do cp "assets/space-war/models/$m.glb" "godot/assets/models/$m.glb"; done
