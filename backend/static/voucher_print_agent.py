"""
Voucher88 Print Agent - kirim ESC/POS mentah ke printer thermal (Epson TM-T82 dll).

Cara pakai (Windows):
  1. Install Python 3 dari https://www.python.org/downloads/  (centang "Add Python to PATH")
  2. Buka Command Prompt, jalankan:  pip install pywin32
  3. Jalankan agen:  python voucher_print_agent.py "EPSON TM-T82III Receipt"
     (nama printer sesuai yang ada di Control Panel > Printers; kosongkan = printer default)
  4. Biarkan jendela ini tetap terbuka saat mencetak. Di aplikasi: Pengaturan > Metode cetak = Agen Lokal.

Linux/Mac: python3 voucher_print_agent.py /dev/usb/lp0
"""
import base64
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 9100
TARGET = sys.argv[1] if len(sys.argv) > 1 else ""


def send_raw(data: bytes, target: str):
    if target.startswith("/") or target.startswith("\\\\"):
        with open(target, "wb") as f:
            f.write(data)
        return target
    import win32print  # pywin32

    name = target or win32print.GetDefaultPrinter()
    h = win32print.OpenPrinter(name)
    try:
        win32print.StartDocPrinter(h, 1, ("Voucher88", None, "RAW"))
        win32print.StartPagePrinter(h)
        win32print.WritePrinter(h, data)
        win32print.EndPagePrinter(h)
        win32print.EndDocPrinter(h)
    finally:
        win32print.ClosePrinter(h)
    return name


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._json(200, {"ok": True, "agent": "voucher88", "printer": TARGET or "(default)"})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(length) or b"{}")
            data = base64.b64decode(payload["data"])
            printer = payload.get("printer") or TARGET
            used = send_raw(data, printer)
            print(f"[OK] {len(data)} bytes -> {used}")
            self._json(200, {"ok": True, "bytes": len(data), "printer": used})
        except Exception as e:  # noqa
            print(f"[ERROR] {e}")
            self._json(500, {"ok": False, "error": str(e)})

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    print(f"Voucher88 Print Agent aktif di http://localhost:{PORT}  -> printer: {TARGET or '(default)'}")
    print("Biarkan jendela ini terbuka. Tekan Ctrl+C untuk berhenti.")
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
