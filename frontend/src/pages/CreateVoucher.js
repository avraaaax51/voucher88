import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/AdminLayout";
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
  const [loading, setLoading] = useState(false);
  const [createdVouchers, setCreatedVouchers] = useState([]);
  const [formData, setFormData] = useState({
    title: "",
    nominal: "",
    terms: "",
    expires_at: "",
    quantity: 1,
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

            {/* Print Layout - 80mm Thermal - Toko Aneka 88 Style */}
            <div className="print-area" data-testid="print-area" style={{ display: 'none' }}>
              {createdVouchers.map((voucher, idx) => (
                <div
                  key={voucher.code}
                  style={{ 
                    width: '80mm', 
                    padding: '3mm 4mm', 
                    backgroundColor: 'white', 
                    color: 'black',
                    fontFamily: 'Arial, sans-serif',
                    pageBreakAfter: 'always'
                  }}
                >
                  {/* Dashed top border */}
                  <div style={{ borderTop: '2px dashed #000', marginBottom: '4mm' }}></div>
                  
                  {/* Store Header */}
                  <div style={{ textAlign: 'center', marginBottom: '3mm' }}>
                    <p style={{ fontSize: '14px', fontWeight: 'bold', margin: 0, letterSpacing: '1px' }}>Toko</p>
                    <p style={{ fontSize: '28px', fontWeight: '900', margin: '0', letterSpacing: '2px', lineHeight: '1.1' }}>
                      ANEKA<span style={{ color: '#000' }}>88</span>
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2mm' }}>
                      <span style={{ flex: 1, height: '1px', backgroundColor: '#000' }}></span>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '2px' }}>MANGON</span>
                      <span style={{ flex: 1, height: '1px', backgroundColor: '#000' }}></span>
                    </div>
                  </div>

                  {/* Voucher Belanja Banner with arrows */}
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'stretch',
                    marginBottom: '4mm',
                    height: '8mm'
                  }}>
                    {/* Left arrow */}
                    <div style={{
                      width: 0,
                      height: 0,
                      borderTop: '4mm solid transparent',
                      borderBottom: '4mm solid transparent',
                      borderRight: '4mm solid #000'
                    }}></div>
                    {/* Center text */}
                    <div style={{ 
                      backgroundColor: '#000', 
                      color: '#fff', 
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', letterSpacing: '3px' }}>VOUCHER BELANJA</p>
                    </div>
                    {/* Right arrow */}
                    <div style={{
                      width: 0,
                      height: 0,
                      borderTop: '4mm solid transparent',
                      borderBottom: '4mm solid transparent',
                      borderLeft: '4mm solid #000'
                    }}></div>
                  </div>

                  {/* Nilai Voucher */}
                  <div style={{ textAlign: 'center', marginBottom: '4mm', borderBottom: '1px solid #000', paddingBottom: '3mm' }}>
                    <p style={{ fontSize: '11px', fontWeight: 'bold', margin: '0 0 1mm 0', letterSpacing: '1px' }}>NILAI VOUCHER</p>
                    <p style={{ fontSize: '32px', fontWeight: '900', margin: 0 }}>
                      Rp.{voucher.nominal.toLocaleString('id-ID')}
                    </p>
                  </div>

                  {/* QR Code */}
                  {voucher.qr_code && (
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4mm' }}>
                      <img
                        src={`data:image/png;base64,${voucher.qr_code}`}
                        alt={`QR ${voucher.code}`}
                        style={{ width: '35mm', height: '35mm' }}
                      />
                    </div>
                  )}

                  {/* Promo Message / Terms */}
                  <div style={{ 
                    backgroundColor: '#000', 
                    color: '#fff', 
                    padding: '3mm 4mm', 
                    textAlign: 'center',
                    borderRadius: '20px',
                    marginBottom: '4mm'
                  }}>
                    <p style={{ margin: 0, fontSize: '11px', fontWeight: 'bold', lineHeight: '1.4' }}>
                      {voucher.terms || 'BELANJA LEBIH HEMAT\nDI TOKO ANEKA 88 MANGON'}
                    </p>
                  </div>

                  {/* Expiry Date */}
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    border: '2px solid #000',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{ 
                      padding: '2mm 3mm', 
                      borderRight: '2px solid #000',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                        <rect x="8" y="14" width="2" height="2"></rect>
                        <rect x="11" y="14" width="2" height="2"></rect>
                        <rect x="14" y="14" width="2" height="2"></rect>
                        <rect x="8" y="17" width="2" height="2"></rect>
                        <rect x="11" y="17" width="2" height="2"></rect>
                      </svg>
                    </div>
                    <div style={{ padding: '2mm 3mm', flex: 1 }}>
                      <p style={{ margin: 0, fontSize: '9px', fontWeight: 'bold' }}>BERLAKU SAMPAI</p>
                      <p style={{ margin: 0, fontSize: '12px', fontWeight: '900' }}>
                        {new Date(voucher.expires_at).toLocaleDateString("id-ID", { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default CreateVoucher;
