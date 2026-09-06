import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const RecoverPasswordDialog = ({ open, onOpenChange }) => {
  const [form, setForm] = useState({ name: "", code: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const valid = form.name.trim() && form.code.replace(/[^A-Z0-9]/gi, "").length === 12 && form.next.length === 6 && form.next === form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), recovery_code: form.code, new_password: form.next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal mereset sandi");
      toast.success(body.message);
      setForm({ name: "", code: "", next: "", confirm: "" });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="recover-dialog">
        <DialogHeader>
          <DialogTitle>Lupa Sandi Admin</DialogTitle>
          <DialogDescription>Masukkan kode pemulihan yang dibuat di Pengaturan, lalu tentukan sandi baru 6 angka.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="rec-name">Nama admin</Label>
            <Input id="rec-name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Admin" data-testid="input-recover-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-code">Kode pemulihan</Label>
            <Input id="rec-code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="XXXX-XXXX-XXXX" className="font-mono tracking-wider" data-testid="input-recover-code" />
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
          <DialogFooter>
            <Button type="submit" disabled={!valid || loading} data-testid="btn-submit-recover">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reset Sandi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
