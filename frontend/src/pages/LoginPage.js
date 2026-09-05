import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../components/ui/input-otp";
import { toast } from "sonner";
import { User, KeyRound, Loader2, Store } from "lucide-react";

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
    <div className="min-h-screen flex">
      {/* Left side - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 bg-cover bg-center relative"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1572231086568-6984943e6629?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzR8MHwxfHNlYXJjaHwzfHxtb2Rlcm4lMjBjb2ZmZWUlMjBzaG9wJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzg4NTg3NTg5fDA&ixlib=rb-4.1.0&q=85')`
        }}
      >
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col justify-end p-12 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center">
              <Store className="w-6 h-6" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">VoucherKu</h1>
          </div>
          <p className="text-lg text-white/80 max-w-md">
            Sistem voucher promo modern untuk toko Anda. Kelola, cetak, dan verifikasi voucher dengan mudah.
          </p>
        </div>
      </div>

      {/* Right side - Login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Store className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight">VoucherKu</h1>
          </div>

          <Card className="border shadow-sm">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold">Masuk</CardTitle>
              <CardDescription>
                Pilih metode login sesuai peran Anda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger 
                    value="admin" 
                    className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                    data-testid="tab-admin"
                  >
                    <User className="w-4 h-4 mr-2" />
                    Admin
                  </TabsTrigger>
                  <TabsTrigger 
                    value="kasir"
                    className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
                    data-testid="tab-kasir"
                  >
                    <KeyRound className="w-4 h-4 mr-2" />
                    Kasir (PIN)
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="admin">
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@toko.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        data-testid="input-email"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        data-testid="input-password"
                        className="h-12"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full h-12 text-base font-semibold"
                      disabled={loading}
                      data-testid="btn-login"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        "Masuk sebagai Admin"
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="kasir">
                  <div className="space-y-6">
                    <div className="text-center">
                      <p className="text-sm text-muted-foreground mb-4">
                        Masukkan PIN 4 digit Anda
                      </p>
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={4}
                          value={pin}
                          onChange={(value) => {
                            setPin(value);
                            if (value.length === 4) {
                              // Auto submit when 4 digits entered
                              setTimeout(() => {
                                document.getElementById("btn-pin-login")?.click();
                              }, 100);
                            }
                          }}
                          data-testid="input-pin"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} className="w-14 h-14 text-2xl" />
                            <InputOTPSlot index={1} className="w-14 h-14 text-2xl" />
                            <InputOTPSlot index={2} className="w-14 h-14 text-2xl" />
                            <InputOTPSlot index={3} className="w-14 h-14 text-2xl" />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>
                    <Button
                      id="btn-pin-login"
                      onClick={handlePinLogin}
                      className="w-full h-14 text-base font-semibold bg-emerald-600 hover:bg-emerald-700"
                      disabled={loading || pin.length !== 4}
                      data-testid="btn-pin-login"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Memproses...
                        </>
                      ) : (
                        "Masuk sebagai Kasir"
                      )}
                    </Button>
                    <p className="text-xs text-center text-muted-foreground">
                      Hubungi admin jika belum punya PIN
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
