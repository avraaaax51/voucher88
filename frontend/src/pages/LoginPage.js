import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { RecoverPasswordDialog } from "../components/RecoverPasswordDialog";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { toast } from "sonner";
import { User, KeyRound, Loader2, Ticket } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [names, setNames] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/names`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.users || [];
        setNames(list);
        const last = localStorage.getItem("voucher88_last_name");
        const pick = list.find((u) => u.name === last) || (list.length === 1 ? list[0] : null);
        if (pick) setName(pick.name);
      })
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!name.trim() || password.length !== 6) {
      toast.error("Masukkan nama dan sandi 6 angka");
      return;
    }
    setLoading(true);
    const result = await login(name.trim(), password);
    setLoading(false);
    if (result.success) {
      toast.success(`Selamat datang, ${result.user.name}!`);
      const nextPath = searchParams.get("next") || "";
      const isSafePath = nextPath.startsWith("/") && !nextPath.startsWith("//");
      const defaultPath = result.user.role === "kasir" ? "/kasir" : "/admin";
      navigate(isSafePath ? nextPath : defaultPath);
      localStorage.setItem("voucher88_last_name", name.trim());
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-amber-50 p-4" data-testid="login-page">
      {/* Comic style pattern background */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle, #000 1px, transparent 1px)`,
          backgroundSize: '20px 20px'
        }}
      />
      
      <div className="relative w-full max-w-md">
        {/* Logo section - Comic style */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-yellow-400 border-4 border-black rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] mb-4 transform -rotate-3 hover:rotate-0 transition-transform">
            <Ticket className="w-10 h-10 text-black" />
          </div>
          <h1 className="text-4xl font-black text-black tracking-tight" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            Voucher88
          </h1>
          <p className="text-gray-600 mt-1 font-medium">Sistem Voucher Toko</p>
        </div>

        {/* Login Card - Comic style */}
        <div className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* Header accent */}
          <div className="h-3 bg-yellow-400 border-b-4 border-black" />
          
          <div className="p-6 pt-5">
            <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
              {names.length > 0 && (
                <div className="space-y-2">
                  <Label className="font-bold text-black">Pilih akun</Label>
                  <div className="flex flex-wrap gap-2" data-testid="quick-names">
                    {names.map((u) => (
                      <button
                        key={u.name}
                        type="button"
                        onClick={() => { setName(u.name); setPassword(""); document.getElementById("password")?.focus(); }}
                        className={`px-3 py-1.5 rounded-full border-2 border-black text-sm font-bold transition-all ${name.trim().toLowerCase() === u.name.toLowerCase() ? "bg-yellow-400 shadow-[2px_2px_0_0_#000]" : "bg-white hover:bg-yellow-100"}`}
                        data-testid={`quick-name-${u.name.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        {u.name}
                        <span className="ml-1 text-[10px] uppercase font-black text-gray-500">{u.role === "superadmin" ? "super" : u.role}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name" className="font-bold text-black">Nama</Label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="name"
                    placeholder="Nama pengguna"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="username"
                    data-testid="input-name"
                    className="h-12 pl-10 border-2 border-black rounded-xl font-medium focus:ring-2 focus:ring-yellow-400 focus:border-black"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="font-bold text-black">Sandi (6 angka)</Label>
                <div className="relative">
                  <KeyRound className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="password"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="current-password"
                    data-testid="input-password"
                    className="h-12 pl-10 border-2 border-black rounded-xl font-medium tracking-[0.4em] focus:ring-2 focus:ring-yellow-400 focus:border-black"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-12 text-base font-bold bg-yellow-400 text-black border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                disabled={loading || password.length !== 6 || !name.trim()}
                data-testid="btn-login"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  "Masuk"
                )}
              </Button>
              <p className="text-xs text-center font-medium text-gray-500">
                Admin dan kasir masuk dengan nama &amp; sandi 6 angka
              </p>
              <button type="button" onClick={() => setRecoverOpen(true)} className="block mx-auto text-sm font-bold underline decoration-2 decoration-yellow-400 hover:text-yellow-700" data-testid="btn-forgot-password">
                Lupa sandi admin?
              </button>
            </form>
            <RecoverPasswordDialog open={recoverOpen} onOpenChange={setRecoverOpen} initialName={name} />
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-gray-500 mt-6 font-medium">
          Voucher88 v1.1
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
