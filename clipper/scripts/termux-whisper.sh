#!/data/data/com.termux/files/usr/bin/bash
# One-time setup for automatic transcription on Android: builds whisper.cpp's command-line program with
# Termux's own compiler. Takes about 5-15 minutes. The app finds it at ~/whisper.cpp/build/bin/whisper-cli.
# The speech model itself is downloaded by the app the first time you press "Start analysis".
set -euo pipefail
VERSION=v1.9.5   # the release the app's JSON reader was checked against
pkg install -y git cmake clang make
if [ ! -d ~/whisper.cpp ]; then
  git clone --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp ~/whisper.cpp
fi
cd ~/whisper.cpp
cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_SDL2=OFF
cmake --build build -j"$(nproc)" --target whisper-cli
./build/bin/whisper-cli --help >/dev/null 2>&1 || { echo "Build finished but whisper-cli does not run."; exit 1; }
echo
echo "whisper.cpp is ready. Restart the app (Ctrl+C, then ./scripts/termux.sh) and press Start analysis."
