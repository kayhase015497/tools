#!/bin/sh
# 從 UVR5 抽出的人聲合輯（四語言串接）切出各語言台詞。名稱 起 迄（秒）。用法：sh tools-src/audio/cut_voice.sh
# 切點依據：靜音/音量分析 + SenseVoice(sherpa-onnx) 語音辨識的時間戳；英文為使用者指定區間再微調。
SRC="assets/space-war/herta fleet.mp3"; OUT=assets/space-war/voice
cut() { ffmpeg -hide_banner -v error -y -ss "$3" -to "$4" -i "$SRC" -ac 1 -ar 44100 \
  -af "afade=t=in:d=0.03,loudnorm=I=-18:TP=-2:LRA=7,afade=t=out:st=$(echo "$4 - $3 - 0.15" | bc):d=0.15" -c:a libmp3lame -b:a 80k "$OUT/$1/$2.mp3"; }
# --- en
cut en lyc1 29.9 38.7;   cut en lyc2 39.3 46.5;   cut en herta1 53.8 57.3;  cut en herta2 57.9 64.6
cut en cyrene 67.0 70.95; cut en dan 71.8 74.9;   cut en march 75.6 78.9;    cut en tb 81.8 87.3
# --- ja
cut ja lyc1 121.4 129.3;  cut ja lyc2 130.7 136.3; cut ja herta1 145.75 148.5; cut ja herta2 149.0 154.9
cut ja cyrene 158.2 162.1; cut ja dan 162.6 166.2; cut ja march 166.2 169.7;    cut ja tb 172.3 178.1
# --- zh
cut zh lyc1 212.4 220.3;  cut zh lyc2 221.2 227.9; cut zh herta1 235.5 239.9;   cut zh herta2 240.0 247.0
cut zh cyrene 249.3 253.6; cut zh dan 253.65 257.1; cut zh march 257.1 260.6;   cut zh tb 263.4 269.0
# --- ko
cut ko lyc1 303.4 311.8;  cut ko lyc2 312.35 319.0; cut ko herta1 327.2 330.3;  cut ko herta2 332.8 338.3
cut ko cyrene 340.4 344.2; cut ko dan 344.6 348.1; cut ko march 348.2 352.1;    cut ko tb 352.5 359.7
# lyc3（鐵墓下刺時的來古士台詞，英文）：使用者提供已切好的人聲檔（原檔不入庫），僅正規化後輸出：
# ffmpeg -i <原檔> -ac 1 -ar 44100 -af "afade=t=in:d=0.03,loudnorm=I=-18:TP=-2:LRA=7,afade=t=out:st=7.85:d=0.15" -c:a libmp3lame -b:a 80k assets/space-war/voice/en/lyc3.mp3
# lyc4（衝擊後蓋板台詞「The conclusion is irrefutable…」，英文 21 秒）：同上，使用者提供的人聲檔：
# ffmpeg -i <原檔> -ac 1 -ar 44100 -af "afade=t=in:d=0.03,loudnorm=I=-18:TP=-2:LRA=7,afade=t=out:st=20.85:d=0.15" -c:a libmp3lame -b:a 80k assets/space-war/voice/en/lyc4.mp3
