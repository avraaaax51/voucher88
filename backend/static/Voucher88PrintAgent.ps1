# Voucher88 Print Agent (PowerShell, tanpa install apa pun)
# Jalankan lewat Voucher88PrintAgent.bat. Menerima ESC/POS dari aplikasi web di http://localhost:9100
# dan mengirimnya RAW ke printer Windows (Epson TM-T82 dll). Perintah potong kertas sudah termasuk di data.
param(
  [string]$Printer = "",
  [int]$Port = 9100
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern bool OpenPrinter(string src, out IntPtr h, IntPtr pd);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode)] static extern int StartDocPrinter(IntPtr h, int level, ref DOCINFOW di);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError=true)] static extern bool WritePrinter(IntPtr h, byte[] bytes, int count, out int written);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("Printer tidak ditemukan: " + printer);
    try {
      DOCINFOW di = new DOCINFOW(); di.pDocName = "Voucher88"; di.pDataType = "RAW";
      if (StartDocPrinter(h, 1, ref di) == 0) throw new Exception("StartDocPrinter gagal (" + Marshal.GetLastWin32Error() + ")");
      StartPagePrinter(h);
      int written;
      if (!WritePrinter(h, data, data.Length, out written)) throw new Exception("WritePrinter gagal");
      EndPagePrinter(h); EndDocPrinter(h);
    } finally { ClosePrinter(h); }
  }
}
"@

if ([string]::IsNullOrWhiteSpace($Printer)) {
  $Printer = (Get-CimInstance Win32_Printer | Where-Object Default -eq $true | Select-Object -First 1).Name
}
$enc = [System.Text.Encoding]::UTF8
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
Write-Host "Voucher88 Print Agent aktif di http://localhost:$Port  -> printer: $Printer" -ForegroundColor Green
Write-Host "Biarkan jendela ini terbuka saat mencetak. Tutup jendela untuk berhenti."

function Send-Response($stream, [int]$code, [string]$json) {
  $body = $enc.GetBytes($json)
  $status = if ($code -eq 200) { "200 OK" } elseif ($code -eq 204) { "204 No Content" } else { "500 Internal Server Error" }
  $head = "HTTP/1.1 $status`r`nContent-Type: application/json`r`nContent-Length: $($body.Length)`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET, POST, OPTIONS`r`nAccess-Control-Allow-Headers: Content-Type`r`nAccess-Control-Allow-Private-Network: true`r`nConnection: close`r`n`r`n"
  $hb = $enc.GetBytes($head)
  $stream.Write($hb, 0, $hb.Length); if ($body.Length -gt 0) { $stream.Write($body, 0, $body.Length) }
  $stream.Flush()
}

while ($true) {
  $client = $listener.AcceptTcpClient()
  try {
    $stream = $client.GetStream()
    $stream.ReadTimeout = 15000
    $ms = New-Object System.IO.MemoryStream
    $buf = New-Object byte[] 65536
    $headerEnd = -1; $contentLength = 0
    while ($true) {
      $n = $stream.Read($buf, 0, $buf.Length); if ($n -le 0) { break }
      $ms.Write($buf, 0, $n)
      $all = $ms.ToArray()
      if ($headerEnd -lt 0) {
        $txt = [System.Text.Encoding]::ASCII.GetString($all)
        $idx = $txt.IndexOf("`r`n`r`n")
        if ($idx -ge 0) {
          $headerEnd = $idx + 4
          $m = [regex]::Match($txt.Substring(0, $idx), "(?im)^Content-Length:\s*(\d+)")
          if ($m.Success) { $contentLength = [int]$m.Groups[1].Value }
        }
      }
      if ($headerEnd -ge 0 -and ($ms.Length - $headerEnd) -ge $contentLength) { break }
    }
    $all = $ms.ToArray()
    $reqText = [System.Text.Encoding]::ASCII.GetString($all, 0, [Math]::Max($headerEnd, 0))
    $method = ($reqText -split " ")[0]
    if ($method -eq "OPTIONS") { Send-Response $stream 204 ""; continue }
    if ($method -eq "GET") { Send-Response $stream 200 ('{"ok":true,"agent":"voucher88-ps","printer":"' + $Printer.Replace('\','\\') + '"}'); continue }
    $bodyText = $enc.GetString($all, $headerEnd, $all.Length - $headerEnd)
    $payload = $bodyText | ConvertFrom-Json
    $bytes = [Convert]::FromBase64String($payload.data)
    $target = if ($payload.printer) { [string]$payload.printer } else { $Printer }
    [RawPrinter]::Send($target, $bytes)
    Write-Host ("[OK] {0} bytes -> {1}" -f $bytes.Length, $target)
    Send-Response $stream 200 ('{"ok":true,"bytes":' + $bytes.Length + ',"printer":"' + $target.Replace('\','\\') + '"}')
  } catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    try { Send-Response $stream 500 ('{"ok":false,"error":"' + $_.Exception.Message.Replace('"','\"') + '"}') } catch {}
  } finally { $client.Close() }
}
