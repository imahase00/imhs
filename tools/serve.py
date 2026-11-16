"""IMHS ローカル配信（Python 標準ライブラリのみ）

使い方: python tools/serve.py [port] [docsフォルダ]
Windows のレジストリ設定に左右されないよう MIME タイプを固定し、
更新確認が効くよう Cache-Control: no-cache を付ける。
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
DOCS = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parent.parent / "docs"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        "": "application/octet-stream",
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".txt": "text/plain; charset=utf-8",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):  # 静かに
        pass


def main() -> int:
    if not (DOCS / "index.html").is_file():
        print(f"docs フォルダが見つかりません: {DOCS}")
        return 1
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=str(DOCS)))
    except OSError:
        print(f"ポート {PORT} を使えませんでした（使用中の可能性があります）。")
        return 2
    print(f"IMHS を配信中: http://127.0.0.1:{PORT}/")
    print("このウィンドウを閉じる（または Ctrl+C）とサーバーが止まります。")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
