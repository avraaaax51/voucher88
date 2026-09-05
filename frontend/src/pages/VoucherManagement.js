import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import AdminLayout from "../components/AdminLayout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Printer,
  Eye,
  Filter,
  Ticket,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const VoucherManagement = () => {
  const { getAuthHeaders } = useAuth();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    fetchVouchers();
  }, [statusFilter]);

  const fetchVouchers = async () => {
    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const { data } = await axios.get(`${API_URL}/api/vouchers${params}`, {
        withCredentials: true,
        headers: getAuthHeaders(),
      });
      setVouchers(data.vouchers || []);
    } catch (error) {
      toast.error("Gagal memuat data voucher");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const getStatusBadge = (voucher) => {
    const now = new Date();
    const expiresAt = new Date(voucher.expires_at);
    
    if (voucher.status === "redeemed") {
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">Terpakai</Badge>;
    }
    if (voucher.status === "expired" || expiresAt < now) {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Kadaluarsa</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aktif</Badge>;
  };

  const filteredVouchers = vouchers.filter((v) =>
    v.code.toLowerCase().includes(search.toLowerCase()) ||
    v.title.toLowerCase().includes(search.toLowerCase())
  );

  const handlePrint = (voucher) => {
    setSelectedVoucher(voucher);
    setTimeout(() => {
      window.print();
    }, 100);
  };

  const handleViewDetail = (voucher) => {
    setSelectedVoucher(voucher);
    setShowDetailModal(true);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Kelola Voucher</h1>
            <p className="text-muted-foreground mt-1">
              {vouchers.length} voucher tersedia
            </p>
          </div>
          <Link to="/admin/vouchers/create">
            <Button className="h-11 px-6 font-semibold" data-testid="btn-create-voucher">
              <Plus className="w-4 h-4 mr-2" />
              Buat Voucher Baru
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari kode atau judul voucher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-11"
              data-testid="input-search-voucher"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11" data-testid="select-status-filter">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Filter Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="redeemed">Terpakai</SelectItem>
              <SelectItem value="expired">Kadaluarsa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Voucher List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <Skeleton className="w-16 h-16 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredVouchers.length > 0 ? (
          <div className="space-y-3">
            {filteredVouchers.map((voucher) => (
              <Card 
                key={voucher._id} 
                className="border hover:shadow-sm transition-shadow"
                data-testid={`voucher-card-${voucher.code}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* QR Preview */}
                    <div className="w-16 h-16 bg-white border rounded flex-shrink-0 overflow-hidden">
                      <img
                        src={`data:image/png;base64,${voucher.qr_code}`}
                        alt="QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-sm">{voucher.code}</span>
                        {getStatusBadge(voucher)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{voucher.title}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm">
                        <span className="font-semibold text-emerald-600">
                          {formatCurrency(voucher.nominal)}
                        </span>
                        <span className="text-muted-foreground">
                          Exp: {formatDate(voucher.expires_at)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDetail(voucher)}
                        data-testid={`btn-view-${voucher.code}`}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePrint(voucher)}
                        data-testid={`btn-print-${voucher.code}`}
                      >
                        <Printer className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border">
            <CardContent className="py-16 text-center">
              <Ticket className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
              <h3 className="text-lg font-semibold mb-2">Tidak ada voucher</h3>
              <p className="text-muted-foreground mb-6">
                {search ? "Tidak ditemukan voucher dengan pencarian tersebut" : "Mulai buat voucher baru untuk toko Anda"}
              </p>
              <Link to="/admin/vouchers/create">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Buat Voucher
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Detail Voucher</DialogTitle>
            </DialogHeader>
            {selectedVoucher && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="w-40 h-40 bg-white border rounded p-2">
                    <img
                      src={`data:image/png;base64,${selectedVoucher.qr_code}`}
                      alt="QR Code"
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
                
                <div className="text-center">
                  <p className="font-mono text-xl font-bold">{selectedVoucher.code}</p>
                  {getStatusBadge(selectedVoucher)}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Judul Promo</span>
                    <span className="font-medium">{selectedVoucher.title}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Nominal</span>
                    <span className="font-semibold text-emerald-600">
                      {formatCurrency(selectedVoucher.nominal)}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">Berlaku Sampai</span>
                    <span>{formatDate(selectedVoucher.expires_at)}</span>
                  </div>
                  {selectedVoucher.terms && (
                    <div className="py-2">
                      <span className="text-muted-foreground block mb-1">Syarat & Ketentuan</span>
                      <p className="text-xs">{selectedVoucher.terms}</p>
                    </div>
                  )}
                  {selectedVoucher.status === "redeemed" && selectedVoucher.redeemed_at && (
                    <div className="flex justify-between py-2 border-t">
                      <span className="text-muted-foreground">Digunakan</span>
                      <span>{formatDate(selectedVoucher.redeemed_at)}</span>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={() => handlePrint(selectedVoucher)}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Cetak Voucher
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Print Template (Hidden) */}
        {selectedVoucher && (
          <div className="print-voucher fixed left-0 top-0" ref={printRef}>
            <div className="w-[300px] p-4 bg-white text-black font-sans">
              <div className="text-center border-b-2 border-black pb-3 mb-3">
                <h1 className="text-lg font-bold">VOUCHER PROMO</h1>
                <p className="text-sm">Nama Toko</p>
              </div>
              
              <div className="text-center mb-3">
                <p className="text-2xl font-bold">{formatCurrency(selectedVoucher.nominal)}</p>
                <p className="text-sm font-medium mt-1">{selectedVoucher.title}</p>
              </div>

              <div className="flex justify-center mb-3">
                <img
                  src={`data:image/png;base64,${selectedVoucher.qr_code}`}
                  alt="QR Code"
                  className="w-32 h-32"
                />
              </div>

              <div className="text-center mb-3">
                <p className="font-mono text-lg font-bold">{selectedVoucher.code}</p>
              </div>

              <div className="border-t-2 border-black pt-3 text-xs text-center">
                <p>Berlaku s/d: {formatDate(selectedVoucher.expires_at)}</p>
                {selectedVoucher.terms && (
                  <p className="mt-1 text-[10px]">{selectedVoucher.terms}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default VoucherManagement;
