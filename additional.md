potential download fix (unused):

yt-dlp -f "bv*[vcodec^=avc1][height<=720]+ba/b[ext=mp4]" --merge-output-format mp4 \
  -o "clips/clip1.mp4" "https://www.youtube.com/shorts/xBHYWAbNrwY"