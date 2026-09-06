import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const API_URL = process.env.REACT_APP_BACKEND_URL;
const digits = (v) => v.replace(/\D/g, "").slice(0, 6);

export const ChangePasswordDialog = ({ open, onOpenChange }) => {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: digits(e.target.value) }));
  const valid = form.current.length === 6 && form.next.length === 6 && form.next === form.confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (form.next === form.current) return toast.error("Sandi baru harus berbeda dari sandi lama");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current_password: form.current, new_password: form.next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal mengganti sandi");
      toast.success(body.message);
      setForm({ current: "", next: "", confirm: "" });
      onOpenChange(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle>Ganti Sandi</DialogTitle>
          <DialogDescription>Sandi terdiri dari 6 angka.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {[
            ["current", "Sandi Saat Ini", "input-current-password"],
            ["next", "Sandi Baru", "input-new-password"],
            ["confirm", "Ulangi Sandi Baru", "input-confirm-password"],
          ].map(([k, label, tid]) => (
            <div key={k} className="space-y-2">
              <Label htmlFor={tid}>{label}</Label>
              <Input id={tid} type="password" inputMode="numeric" maxLength={6} value={form[k]} onChange={set(k)} placeholder="••••••" data-testid={tid} />
            </div>
          ))}
          {form.confirm.length === 6 && form.next !== form.confirm && (
            <p className="text-sm text-red-600" data-testid="password-mismatch">Sandi baru tidak sama</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!valid || loading} data-testid="btn-submit-change-password">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Simpan Sandi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
