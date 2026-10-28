#!/usr/bin/env bash
# 用本机 Chrome 无头模式渲染 index.html 到 PNG，用于人工比对版式。
# 注：下面三处路径按本机写的，换机器时改 CHROME / BASE / OUT 即可。
#   第 4 个参数是 --default-background-color：模拟 OBS 场景底，
#   写成 00000000 则保留透明通道，用来验证浏览器源背景确实是透明的。
set -u
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"
BASE="file:///D:/git/obs_showTime/index.html"
OUT="D:/git/obs_showTime/dev/shots"
mkdir -p "$OUT"

shot () {
  local name="$1"; shift
  local w="$1"; shift
  local h="$1"; shift
  local bg="$1"; shift
  local qs="$1"; shift
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --no-default-browser-check --disable-extensions --force-device-scale-factor=2 \
    --window-size="${w},${h}" --default-background-color="$bg" \
    --virtual-time-budget=2000 \
    --screenshot="$OUT/$name.png" "$BASE?$qs" >/dev/null 2>&1
  if [ -f "$OUT/$name.png" ]; then echo "ok   $name.png"; else echo "FAIL $name.png"; fi
}

shot default-white-on-dark  480 140 "2B3A4A" "color=ffffff&outline=000000"
shot dark-on-light          480 140 "EEF1F6" "color=101418&outline=ffffff&outlineWidth=6"
shot gold                   480 140 "102030" "color=ffd54a&outline=241a00&outlineWidth=6"
shot wide-no-date           960 160 "1E2430" "color=ffffff&showDate=0"
shot small                  260 80  "1E2430" "color=ffffff"
shot h12-en                 480 150 "1E2430" "tz=America/New_York&h24=0&lang=en-US&color=ffffff"
shot help                   640 520 "101418" "help=1&color=ffffff&debug=1"
shot bad-tz                 480 140 "1E2430" "tz=Asia/Shanghi&debug=1&color=ffffff"
shot transparent            480 140 "00000000" "color=ffffff"
shot size-70                480 140 "1E2430" "color=ffffff&size=70"
shot size-date40            480 140 "1E2430" "color=ffffff&dateSize=40"
shot size-px                480 140 "1E2430" "color=ffffff&size=40px&dateSize=14px"
# 生成器界面：中文 / 英文各一张（README 用）
bui () {
  local name="$1"; shift
  local lang="$1"; shift
  local prof="$1"; shift
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run     --no-default-browser-check --disable-extensions --force-device-scale-factor=1     --user-data-dir="$prof" --lang="$lang"     --window-size=1320,1270 --default-background-color=11141a     --virtual-time-budget=4000     --screenshot="$OUT/$name.png" "file:///D:/git/obs_showTime/builder.html" >/dev/null 2>&1
  if [ -f "$OUT/$name.png" ]; then echo "ok   $name.png"; else echo "FAIL $name.png"; fi
}
bui builder     zh-CN /tmp/cprof-zh
bui builder-en  en-US /tmp/cprof-en

echo "--- 输出目录: $OUT"
