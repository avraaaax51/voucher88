import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Html5QrcodeScanner } from "html5-qrcode";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { toast } from "sonner";
import { useSound } from "../hooks/useSound";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import {
  ScanLine,
  Keyboard,
  Volume2,
  VolumeX,
  History,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  Store,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CashierMode = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  
  const [mode, setMode] = useState("scan"); // scan or manual
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { success, message, voucher }
  const [scannerReady, setScannerReady] = useState(false);
  
  const scannerRef = useRef(null);
  const handleScanRef = useRef(null);
  const busyRef = useRef(false);
  const { enabled: soundOn, toggle: toggleSound, playSuccess, playError } = useSound();
  const [history, setHistory] = useState({ items: [], count: 0, total_nominal: 0 });

  const fetchHistory = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/redemptions/mine`, { withCredentials: true });
      setHistory(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);
  useAutoRefresh(fetchHistory);
  const lastScanRef = useRef({ code: "", at: 0 });

  const initScanner = useCallback(() => {
    setScannerReady(false);
    
    // Clear existing scanner
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
    }
    
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1,
        showTorchButtonIfSupported: true,
        showZoomSliderIfSupported: true,
        defaultZoomValueIfSupported: 2,
      },
      false
    );

    scanner.render(
      (decodedText) => {
        const code = String(decodedText || "").trim().split("/").pop().toUpperCase();
        const now = Date.now();
        if (busyRef.current) return;
        if (lastScanRef.current.code === code && now - lastScanRef.current.at < 4000) return;
        lastScanRef.current = { code, at: now };
        try { scanner.pause(true); } catch {}
        handleScanRef.current?.(code);
      },
      (error) => {
        // Error callback - ignore scan errors
      }
    );

    scannerRef.current = scanner;
    setScannerReady(true);
  }, []);

  useEffect(() => {
    if (mode === "scan") {
      initScanner();
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [mode, initScanner]);

  const handleScan = async (code) => {
    if (busyRef.current) return;
    busyRef.current = true;
    
    setLoading(true);
    setResult(null);
    
    try {
      const { data } = await axios.post(
        `${API_URL}/api/vouchers/redeem`,
        { code: code.trim() },
        {
          withCredentials: true,
        }
      );
      
      setResult({
        success: true,
        message: data.message,
        voucher: data.voucher,
      });
      playSuccess();
      toast.success(data.message);
      fetchHistory();
    } catch (error) {
      const message = error.response?.data?.detail || "Gagal memverifikasi voucher";
      setResult({
        success: false,
        message: message,
        voucher: null,
      });
      playError();
      toast.error(message);
    } finally {
      setLoading(false);
      busyRef.current = false;
    }
  };

  handleScanRef.current = handleScan;

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      toast.error("Masukkan kode voucher");
      return;
    }
    handleScan(manualCode.trim());
  };

  const resetScanner = () => {
    setResult(null);
    setManualCode("");
    lastScanRef.current = { code: "", at: 0 };
    if (mode === "scan" && scannerRef.current) {
      try { scannerRef.current.resume(); } catch {}
    }
  };

  const handleBack = () => {
    if (user?.role === "admin") {
      navigate("/admin");
    } else {
      navigate("/login");
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Berhasil logout");
    navigate("/login");
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-emerald-600 text-white px-4 py-4 safe-area-inset-top">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-white hover:bg-emerald-700 -ml-2"
            data-testid="btn-back"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            {user?.role === "admin" ? "Admin" : "Kembali"}
          </Button>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5" />
            <span className="font-bold">VoucherKu</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-white hover:bg-emerald-700 -mr-2"
            data-testid="btn-logout-kasir"
          >
            Logout
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSound}
            className="text-white hover:bg-emerald-700"
            title={soundOn ? "Matikan suara" : "Nyalakan suara"}
            data-testid="btn-toggle-sound"
          >
            {soundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">
        {/* Mode Toggle */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={mode === "scan" ? "default" : "outline"}
            className={`flex-1 h-14 text-base font-semibold ${
              mode === "scan" ? "bg-emerald-600 hover:bg-emerald-700" : ""
            }`}
            onClick={() => {
              setMode("scan");
              setResult(null);
            }}
            data-testid="btn-mode-scan"
          >
            <ScanLine className="w-5 h-5 mr-2" />
            Scan QR
          </Button>
          <Button
            variant={mode === "manual" ? "default" : "outline"}
            className={`flex-1 h-14 text-base font-semibold ${
              mode === "manual" ? "bg-emerald-600 hover:bg-emerald-700" : ""
            }`}
            onClick={() => {
              setMode("manual");
              setResult(null);
              if (scannerRef.current) {
                scannerRef.current.clear().catch(() => {});
              }
            }}
            data-testid="btn-mode-manual"
          >
            <Keyboard className="w-5 h-5 mr-2" />
            Ketik Kode
          </Button>
        </div>

        {/* Result Display */}
        {result && (
          <Card 
            className={`mb-6 border-2 ${
              result.success 
                ? "border-emerald-500 bg-emerald-50" 
                : "border-red-500 bg-red-50"
            }`}
            data-testid="result-card"
          >
            <CardContent className="p-6">
              <div className="flex items-center justify-center my-4">
                <div
                  className={`comic-stamp ${result.success ? "comic-stamp-ok" : "comic-stamp-fail"}`}
                  data-testid="result-stamp"
                >
                  {result.success ? <CheckCircle2 className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={3} /> : <XCircle className="w-12 h-12 sm:w-16 sm:h-16" strokeWidth={3} />}
                  <span data-testid="result-message">{result.success ? "BERHASIL!" : "DITOLAK!"}</span>
                </div>
              </div>
              
              <p className="text-center text-gray-600 mb-4">{result.message}</p>
              
              {result.success && result.voucher && (
                <div className="bg-white rounded-lg p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kode:</span>
                    <span className="font-mono font-bold">{result.voucher.code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Nominal:</span>
                    <span className="font-bold text-emerald-600">
                      {formatCurrency(result.voucher.nominal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Promo:</span>
                    <span className="font-medium">{result.voucher.title}</span>
                  </div>
                </div>
              )}
              
              <Button
                onClick={resetScanner}
                className="w-full mt-4 h-14 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
                data-testid="btn-scan-again"
              >
                <RefreshCw className="w-5 h-5 mr-2" />
                Scan Voucher Lain
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Scanner / Manual Input */}
        {mode === "scan" && (
          <div className={`space-y-4 ${result ? "hidden" : ""}`}>
                <Card className="overflow-hidden">
                  <CardContent className="p-0">
                    <div 
                      id="qr-reader" 
                      className="w-full"
                      data-testid="qr-scanner"
                    />
                  </CardContent>
                </Card>
                
                {loading && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mr-2" />
                    <span className="text-muted-foreground">Memverifikasi...</span>
                  </div>
                )}
                
                <p className="text-center text-sm text-muted-foreground">
                  Arahkan kamera ke kode QR pada voucher
                </p>
          </div>
        )}
        {mode === "manual" && !result && (
              <form onSubmit={handleManualSubmit} className="space-y-4">
                <div>
                  <Input
                    type="text"
                    placeholder="Contoh: H7M0YCY001"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                    className="h-16 text-xl text-center font-mono tracking-wider"
                    autoFocus
                    data-testid="input-manual-code"
                  />
                </div>
                
                <Button
                  type="submit"
                  disabled={loading || !manualCode.trim()}
                  className="w-full h-16 text-lg font-semibold bg-emerald-600 hover:bg-emerald-700"
                  data-testid="btn-verify-code"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Memverifikasi...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Verifikasi Voucher
                    </>
                  )}
                </Button>
                
                <p className="text-center text-sm text-muted-foreground">
                  Masukkan kode voucher yang tercetak
                </p>
              </form>
        )}

        {/* Today's history */}
        <Card className="mt-8" data-testid="cashier-history">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-bold">
                <History className="w-4 h-4" /> Riwayat Hari Ini
              </div>
              <span className="text-sm" data-testid="cashier-history-summary">
                {history.count} voucher · {formatCurrency(history.total_nominal)}
              </span>
            </div>
            {history.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3" data-testid="cashier-history-empty">Belum ada voucher yang di-scan hari ini</p>
            ) : (
              <ul className="divide-y max-h-64 overflow-y-auto">
                {history.items.map((h) => (
                  <li key={`${h.voucher_code}-${h.redeemed_at}`} className="flex items-center justify-between py-2 text-sm" data-testid={`history-item-${h.voucher_code}`}>
                    <span className="font-mono font-bold">{h.voucher_code}</span>
                    <span className="text-emerald-700 font-bold">{formatCurrency(h.nominal)}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(h.redeemed_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* User Info */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Login sebagai: <span className="font-medium">{user?.name}</span></p>
        </div>
      </main>
    </div>
  );
};

export default CashierMode;
