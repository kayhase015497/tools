#!/bin/sh
# 把網頁版的 GLB 艦艇模型同步到 Godot 專案（assets/space-war/models → godot/assets/models）。用法：sh tools-src/godot/sync_models.sh
for m in cruiser ipc hss frigate fighter ipc_fighter ipc_sid whale xzd irontomb moon; do cp "assets/space-war/models/$m.glb" "godot/assets/models/$m.glb"; done
