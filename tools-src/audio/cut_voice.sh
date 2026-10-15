#!/bin/sh
# 從 UVR5 抽出的人聲合輯切出英文台詞（名稱 起 迄，單位秒）。用法：sh tools-src/audio/cut_voice.sh
SRC="assets/space-war/herta fleet.mp3"; OUT=assets/space-war/voice/en
cut() { ffmpeg -hide_banner -v error -y -ss "$2" -to "$3" -i "$SRC" -ac 1 -ar 44100 \
  -af "afade=t=in:d=0.03,loudnorm=I=-18:TP=-2:LRA=7,afade=t=out:st=$(echo "$3 - $2 - 0.15" | bc):d=0.15" -c:a libmp3lame -b:a 80k "$OUT/$1.mp3"; }
cut lyc1 29.9 38.7
cut lyc2 39.3 46.5
cut herta1 53.8 57.3
cut herta2 57.9 64.6
cut cyrene 67.0 70.95
cut dan 71.8 74.9
cut march 75.6 78.9
cut tb 81.8 87.3
