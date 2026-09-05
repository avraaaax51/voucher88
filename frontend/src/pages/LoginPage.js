import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/ui/input-otp";
import { toast } from "sonner";
import { User, KeyRound, Loader2, Ticket } from "lucide-react";

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, pinLogin } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("admin");

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Masukkan email dan password");
      return;
    }
    
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    
    if (result.success) {
      toast.success(`Selamat datang, ${result.user.name}!`);
      navigate(result.user.role === "admin" ? "/admin" : "/kasir");
    } else {
      toast.error(result.error);
    }
  };

  const handlePinLogin = async () => {
    if (pin.length !== 4) {
      toast.error("Masukkan PIN 4 digit");
      return;
    }
    
    setLoading(true);
    const result = await pinLogin(pin);
    setLoading(false);
    
    if (result.success) {
      toast.success(`Selamat datang, ${result.user.name}!`);
      navigate("/kasir");
    } else {
      toast.error(result.error);
      setPin("");
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
            VoucherKu
          </h1>
          <p className="text-gray-600 mt-1 font-medium">Sistem Voucher Toko</p>
        </div>

        {/* Login Card - Comic style */}
        <div className="bg-white border-4 border-black rounded-3xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
          {/* Header accent */}
          <div className="h-3 bg-yellow-400 border-b-4 border-black" />
          
          <div className="p-6 pt-5">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100 p-1 rounded-xl border-2 border-black">
                <TabsTrigger 
                  value="admin" 
                  className="rounded-lg font-bold data-[state=active]:bg-yellow-400 data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
                  data-testid="tab-admin"
                >
                  <User className="w-4 h-4 mr-2" />
                  Admin
                </TabsTrigger>
                <TabsTrigger 
                  value="kasir"
                  className="rounded-lg font-bold data-[state=active]:bg-emerald-400 data-[state=active]:text-black data-[state=active]:border-2 data-[state=active]:border-black data-[state=active]:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
                  data-testid="tab-kasir"
                >
                  <KeyRound className="w-4 h-4 mr-2" />
                  Kasir
                </TabsTrigger>
              </TabsList>

              <TabsContent value="admin">
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="font-bold text-black">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@toko.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="input-email"
                      className="h-12 border-2 border-black rounded-xl font-medium focus:ring-2 focus:ring-yellow-400 focus:border-black"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="font-bold text-black">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="input-password"
                      className="h-12 border-2 border-black rounded-xl font-medium focus:ring-2 focus:ring-yellow-400 focus:border-black"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-bold bg-yellow-400 text-black border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                    disabled={loading}
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
                </form>
              </TabsContent>

              <TabsContent value="kasir">
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="inline-block bg-emerald-100 border-2 border-black rounded-xl px-4 py-2 mb-4">
                      <p className="text-sm font-bold text-black">
                        Masukkan PIN 4 digit
                      </p>
                    </div>
                    <div className="flex justify-center">
                      <InputOTP
                        maxLength={4}
                        value={pin}
                        onChange={(value) => {
                          setPin(value);
                          if (value.length === 4) {
                            setTimeout(() => {
                              document.getElementById("btn-pin-login")?.click();
                            }, 100);
                          }
                        }}
                        data-testid="input-pin"
                      >
                        <InputOTPGroup className="gap-2">
                          <InputOTPSlot index={0} className="w-14 h-14 text-2xl font-bold border-2 border-black rounded-xl" />
                          <InputOTPSlot index={1} className="w-14 h-14 text-2xl font-bold border-2 border-black rounded-xl" />
                          <InputOTPSlot index={2} className="w-14 h-14 text-2xl font-bold border-2 border-black rounded-xl" />
                          <InputOTPSlot index={3} className="w-14 h-14 text-2xl font-bold border-2 border-black rounded-xl" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>
                  <Button
                    id="btn-pin-login"
                    onClick={handlePinLogin}
                    className="w-full h-14 text-base font-bold bg-emerald-400 text-black border-2 border-black rounded-xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all active:shadow-none active:translate-x-[4px] active:translate-y-[4px]"
                    disabled={loading || pin.length !== 4}
                    data-testid="btn-pin-login"
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
                    Hubungi admin jika belum punya PIN
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Footer text */}
        <p className="text-center text-xs text-gray-500 mt-6 font-medium">
          VoucherKu v1.0
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
