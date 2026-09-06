import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const digits = (v) => v.replace(/\D/g, "").slice(0, 6);

export const RecoverPasswordDialog = ({ open, onOpenChange, initialName = "" }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [hint, setHint] = useState("");
  const [form, setForm] = useState({ code: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);

  const close = (o) => {
    if (!o) { setStep(1); setForm({ code: "", next: "", confirm: "" }); }
    onOpenChange(o);
  };

  const sendCode = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal mengirim kode");
      setHint(body.email_hint);
      setStep(2);
      toast.success(body.message);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/reset-with-code`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), code: form.code, new_password: form.next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal mereset sandi");
      toast.success(body.message);
      close(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validReset = form.code.length === 6 && form.next.length === 6 && form.next === form.confirm;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent data-testid="recover-dialog">
        <DialogHeader>
          <DialogTitle>Lupa Sandi Admin</DialogTitle>
          <DialogDescription>
            {step === 1
              ? "Kode reset 6 digit akan dikirim ke email pemilik toko yang terdaftar."
              : `Kode telah dikirim ke ${hint}. Masukkan kode dan sandi baru 6 angka.`}
          </DialogDescription>
        </DialogHeader>
        {step === 1 ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-name">Nama admin</Label>
              <Input id="rec-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Admin" data-testid="input-recover-name" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={!name.trim() || loading} data-testid="btn-send-reset-code">
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />} Kirim Kode ke Email
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={reset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rec-code">Kode dari email (6 digit)</Label>
              <Input id="rec-code" inputMode="numeric" maxLength={6} value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: digits(e.target.value) }))} placeholder="000000" className="font-mono tracking-[0.4em] text-lg" data-testid="input-recover-code" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rec-next">Sandi baru</Label>
                <Input id="rec-next" type="password" inputMode="numeric" maxLength={6} value={form.next} onChange={(e) => setForm((p) => ({ ...p, next: digits(e.target.value) }))} placeholder="••••••" data-testid="input-recover-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rec-confirm">Ulangi</Label>
                <Input id="rec-confirm" type="password" inputMode="numeric" maxLength={6} value={form.confirm} onChange={(e) => setForm((p) => ({ ...p, confirm: digits(e.target.value) }))} placeholder="••••••" data-testid="input-recover-confirm" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)} data-testid="btn-resend-code">Kirim ulang</Button>
              <Button type="submit" disabled={!validReset || loading} data-testid="btn-submit-recover">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reset Sandi
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
