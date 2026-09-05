import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
import { PrintVoucher } from "../components/PrintVoucher";
import { useStoreSettings } from "../hooks/useStoreSettings";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Ticket, Printer, Loader2 } from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CreateVoucher = () => {
  const navigate = useNavigate();
  const settings = useStoreSettings();
  const [loading, setLoading] = useState(false);
  const [createdVouchers, setCreatedVouchers] = useState([]);
  const [formData, setFormData] = useState({
    title: "",
    nominal: "",
    terms: "",
    expires_at: "",
    quantity: 1,
    prefix: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/vouchers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formData,
          nominal: parseInt(formData.nominal),
          quantity: parseInt(formData.quantity),
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Gagal membuat voucher");
      }

      const data = await response.json();
      setCreatedVouchers(data.vouchers || []);
      toast.success(`Berhasil membuat ${data.vouchers?.length || 0} voucher`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <AdminLayout>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/admin/vouchers")}
            className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
            data-testid="btn-back-vouchers"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Kembali ke Daftar Voucher
          </Button>
          <h1 className="text-3xl font-extrabold tracking-tight">Buat Voucher Baru</h1>
          <p className="text-muted-foreground mt-1">
            Buat voucher satuan atau massal dengan QR code unik
          </p>
        </div>

        {/* Form */}
        {createdVouchers.length === 0 ? (
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5" />
                Detail Voucher
              </CardTitle>
              <CardDescription>
                Isi detail voucher yang akan dibuat
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Nama Voucher</Label>
                    <Input
                      id="title"
                      name="title"
                      placeholder="Contoh: Voucher Diskon 50rb"
                      value={formData.title}
                      onChange={handleChange}
                      required
                      data-testid="input-voucher-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nominal">Nominal (Rp)</Label>
                    <Input
                      id="nominal"
                      name="nominal"
                      type="number"
                      placeholder="50000"
                      value={formData.nominal}
                      onChange={handleChange}
                      required
                      min="1000"
                      data-testid="input-voucher-nominal"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="terms">Syarat & Ketentuan (Opsional)</Label>
                  <Textarea
                    id="terms"
                    name="terms"
                    placeholder="Contoh: Berlaku untuk semua produk, tidak dapat digabung dengan promo lain"
                    value={formData.terms}
                    onChange={handleChange}
                    rows={3}
                    data-testid="input-voucher-terms"
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="expires_at">Tanggal Kadaluarsa</Label>
                    <Input
                      id="expires_at"
                      name="expires_at"
                      type="datetime-local"
                      value={formData.expires_at}
                      onChange={handleChange}
                      required
                      data-testid="input-voucher-expires"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Jumlah Voucher</Label>
                    <Input
                      id="quantity"
                      name="quantity"
                      type="number"
                      placeholder="1"
                      value={formData.quantity}
                      onChange={handleChange}
                      required
                      min="1"
                      max="1000"
                      data-testid="input-voucher-quantity"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maksimal 1000 voucher per batch
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prefix">Prefix Kode (opsional)</Label>
                    <Input
                      id="prefix"
                      name="prefix"
                      placeholder="mis. RM"
                      value={formData.prefix}
                      onChange={(e) => setFormData((p) => ({ ...p, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) }))}
                      maxLength={4}
                      data-testid="input-voucher-prefix"
                    />
                    <p className="text-xs text-muted-foreground">
                      Maks 4 huruf/angka. Kode tetap 10 karakter, contoh:{" "}
                      <span className="font-mono">{(formData.prefix || "") + "X".repeat(7 - (formData.prefix || "").length)}001</span>
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate("/admin/vouchers")}
                    data-testid="btn-cancel-create"
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="min-w-32"
                    data-testid="btn-submit-voucher"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Membuat...
                      </>
                    ) : (
                      <>
                        <Ticket className="w-4 h-4 mr-2" />
                        Buat Voucher
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          /* Created Vouchers Preview */
          <div className="space-y-6">
            <Card className="border shadow-sm bg-emerald-50 border-emerald-200">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-emerald-800">
                      {createdVouchers.length} Voucher Berhasil Dibuat!
                    </h3>
                    <p className="text-sm text-emerald-600">
                      Voucher siap untuk dicetak
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setCreatedVouchers([]);
                        setFormData({
                          title: "",
                          nominal: "",
                          terms: "",
                          expires_at: "",
                          quantity: 1,
                          prefix: "",
                        });
                      }}
                      data-testid="btn-create-more"
                    >
                      Buat Lagi
                    </Button>
                    <Button
                      onClick={handlePrint}
                      className="bg-emerald-600 hover:bg-emerald-700"
                      data-testid="btn-print-vouchers"
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Cetak Semua
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Voucher Grid - Screen View */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:hidden">
              {createdVouchers.map((voucher, idx) => (
                <Card key={voucher.code} className="border overflow-hidden">
                  <CardContent className="p-4">
                    <div className="text-center">
                      {voucher.qr_code && (
                        <img
                          src={`data:image/png;base64,${voucher.qr_code}`}
                          alt={`QR ${voucher.code}`}
                          className="w-24 h-24 mx-auto mb-3"
                        />
                      )}
                      <p className="font-mono text-lg font-bold tracking-wider">
                        {voucher.code}
                      </p>
                      <p className="text-sm font-medium mt-1">{voucher.title}</p>
                      <p className="text-xl font-bold text-emerald-600 mt-1">
                        {formatCurrency(voucher.nominal)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="print-area" data-testid="print-area" style={{ display: 'none' }}>
              {createdVouchers.map((voucher, idx) => (
                <PrintVoucher key={voucher.code} voucher={voucher} settings={settings} pageBreak={idx < createdVouchers.length - 1} />
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CreateVoucher;
