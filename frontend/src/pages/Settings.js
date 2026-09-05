import { useEffect, useState } from "react";
import AdminLayout from "../components/AdminLayout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import { Loader2, Save, Store, Bell, Trash2, AlertTriangle, Printer } from "lucide-react";
import { DEFAULT_SETTINGS } from "../hooks/useStoreSettings";
import { PrintVoucher, PrintPortal } from "../components/PrintVoucher";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const FIELDS = [
  { name: "store_prefix", label: "Teks di atas nama toko", placeholder: "Toko" },
  { name: "store_name", label: "Nama Toko", placeholder: "ANEKA 88" },
  { name: "store_branch", label: "Cabang / Lokasi", placeholder: "MANGON" },
  { name: "promo_line1", label: "Teks Promo Baris 1", placeholder: "BELANJA LEBIH HEMAT" },
  { name: "promo_line2", label: "Teks Promo Baris 2", placeholder: "DI TOKO ANEKA 88 MANGON" },
];

const previewVoucher = { code: "PREVIEW001", nominal: 50000, terms: "", qr_code: "", expires_at: new Date(Date.now() + 30 * 86400000).toISOString() };

const Settings = () => {
  const [form, setForm] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/settings`, { credentials: "include" })
      .then((r) => r.json())
      .then(setForm)
      .catch(() => toast.error("Gagal memuat pengaturan"));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };
  const num = (name, opts = {}) => (
    <Input
      type="number"
      name={name}
      value={form[name] ?? ""}
      onChange={handleChange}
      {...opts}
      data-testid={`input-${name.replace(/_/g, "-")}`}
    />
  );
  const printPayload = (f) => ({
    ...f,
    expiry_warning_days: parseInt(f.expiry_warning_days, 10),
    print_paper_mm: parseInt(f.print_paper_mm, 10),
    print_width_mm: parseInt(f.print_width_mm, 10),
    print_offset_mm: parseFloat(f.print_offset_mm) || 0,
    print_scale: parseInt(f.print_scale, 10),
    print_feed_mm: parseInt(f.print_feed_mm, 10),
    print_page_height_mm: parseInt(f.print_page_height_mm, 10) || 0,
  });
  const handleTestPrint = () => {
    setTimeout(() => window.print(), 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(printPayload(form)),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Gagal menyimpan pengaturan");
      }
      setForm(await res.json());
      toast.success("Pengaturan berhasil disimpan");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetData = async () => {
    if (!window.confirm("Semua voucher dan riwayat penggunaan akan dihapus permanen. Lanjutkan?")) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/reset-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm: resetConfirm }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal menghapus data");
      toast.success(`${body.message} (${body.vouchers_deleted} voucher, ${body.redemptions_deleted} riwayat)`);
      setResetConfirm("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Pengaturan</h1>
          <p className="text-muted-foreground mt-1">Identitas toko pada voucher cetak dan ambang peringatan kedaluwarsa</p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_auto]" data-testid="settings-form">
          <div className="space-y-6">
            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Store className="w-5 h-5" /> Identitas Toko</CardTitle>
                <CardDescription>Teks ini dicetak pada setiap voucher</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <div key={f.name} className="space-y-2">
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <Input id={f.name} name={f.name} value={form[f.name] || ""} onChange={handleChange} placeholder={f.placeholder} data-testid={`input-${f.name.replace(/_/g, "-")}`} />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Bell className="w-5 h-5" /> Peringatan Kedaluwarsa</CardTitle>
                <CardDescription>Voucher aktif yang akan kedaluwarsa dalam N hari ditandai "Segera Kadaluarsa"</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 max-w-xs">
                <Label htmlFor="expiry_warning_days">Ambang hari</Label>
                <Input id="expiry_warning_days" name="expiry_warning_days" type="number" min="1" max="365" value={form.expiry_warning_days} onChange={handleChange} required data-testid="input-expiry-warning-days" />
              </CardContent>
            </Card>

            <Card className="border">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Printer className="w-5 h-5" /> Pengaturan Cetak (Epson TM-T82)</CardTitle>
                <CardDescription>Atur ukuran dan posisi voucher; pratinjau di kanan sama persis dengan hasil cetak. Setiap voucher dicetak di halaman terpisah sehingga printer memotong (auto cut) per voucher.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-2">
                  <Label>Lebar kertas (mm)</Label>
                  {num("print_paper_mm", { min: 50, max: 120 })}
                  <p className="text-xs text-muted-foreground">TM-T82: 80</p>
                </div>
                <div className="space-y-2">
                  <Label>Lebar voucher (mm)</Label>
                  {num("print_width_mm", { min: 40, max: 120 })}
                  <p className="text-xs text-muted-foreground">Area cetak TM-T82: 72</p>
                </div>
                <div className="space-y-2">
                  <Label>Geser kiri/kanan (mm)</Label>
                  {num("print_offset_mm", { min: -20, max: 20, step: 0.5 })}
                  <p className="text-xs text-muted-foreground">Minus = ke kiri, plus = ke kanan</p>
                </div>
                <div className="space-y-2">
                  <Label>Skala isi (%)</Label>
                  {num("print_scale", { min: 50, max: 150, step: 5 })}
                </div>
                <div className="space-y-2">
                  <Label>Jarak bawah sebelum potong (mm)</Label>
                  {num("print_feed_mm", { min: 0, max: 40 })}
                  <p className="text-xs text-muted-foreground">Agar garis bawah tidak ikut terpotong</p>
                </div>
                <div className="space-y-2">
                  <Label>Tinggi halaman per voucher (mm)</Label>
                  {num("print_page_height_mm", { min: 0, max: 400 })}
                  <p className="text-xs text-muted-foreground">Wajib diisi agar auto cut per voucher (mis. 150). 0 = panjang otomatis (sering tidak memotong)</p>
                </div>
                <div className="space-y-2 flex flex-col justify-end">
                  <Button type="button" variant="outline" onClick={handleTestPrint} data-testid="btn-test-print">
                    <Printer className="w-4 h-4 mr-2" /> Cetak Tes
                  </Button>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 text-xs text-muted-foreground rounded-lg bg-muted p-3" data-testid="print-driver-hint">
                  <b>Auto cut</b> dilakukan oleh driver printer di setiap akhir halaman. Pastikan di Windows → Printer Epson TM-T82 → <i>Printing Preferences</i>: <b>Paper Cut = Cut per page / Feed and cut at end of page</b>; dan di dialog print Chrome: <b>Margins = None</b>, <b>Scale = 100</b>, Headers/footers off.
                </div>
              </CardContent>
            </Card>

            <Button type="submit" disabled={saving} className="h-11 px-6 font-semibold" data-testid="btn-save-settings">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Simpan Pengaturan
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Pratinjau cetak (kertas {form.print_paper_mm} mm)</p>
            <div className="border rounded-lg bg-neutral-200 p-4 inline-block" data-testid="settings-print-preview">
              <div
                className="bg-white shadow-md relative"
                style={{ width: `${Number(form.print_paper_mm) || 80}mm`, backgroundImage: "repeating-linear-gradient(90deg, transparent 0, transparent 9.6mm, #e5e7eb 9.6mm, #e5e7eb 10mm)" }}
                data-testid="paper-preview"
              >
                <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-red-300 pointer-events-none" />
                <PrintVoucher voucher={previewVoucher} settings={form} />
                {Number(form.print_page_height_mm) > 0 && (
                  <div
                    className="absolute left-0 right-0 border-t-2 border-dashed border-red-500 text-[10px] text-red-600 text-right pr-1 pointer-events-none"
                    style={{ top: `${Number(form.print_page_height_mm)}mm` }}
                    data-testid="cut-line-preview"
                  >
                    ✂ potong ({form.print_page_height_mm} mm)
                  </div>
                )}
              </div>
            </div>
            <PrintPortal testId="settings-test-print" settings={form}>
              <PrintVoucher voucher={previewVoucher} settings={form} />
            </PrintPortal>
          </div>
        </form>

        <Card className="border border-red-600" data-testid="danger-zone">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-700"><AlertTriangle className="w-5 h-5" /> Zona Bahaya</CardTitle>
            <CardDescription>Hapus semua voucher, riwayat penggunaan, dan nomor urut sehingga data kembali seperti baru. Akun user dan pengaturan toko tetap disimpan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="space-y-2 flex-1 max-w-sm">
              <Label htmlFor="reset-confirm">Ketik <span className="font-mono font-bold">HAPUS SEMUA</span> untuk konfirmasi</Label>
              <Input id="reset-confirm" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value.toUpperCase())} placeholder="HAPUS SEMUA" data-testid="input-reset-confirm" />
            </div>
            <Button type="button" variant="destructive" disabled={resetting || resetConfirm !== "HAPUS SEMUA"} onClick={handleResetData} className="h-10" data-testid="btn-reset-data">
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Hapus Semua Data
            </Button>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default Settings;
