import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import AdminLayout from "../components/AdminLayout";
import { PrintVoucher, PrintPortal } from "../components/PrintVoucher";
import { useStoreSettings, isExpiringSoon } from "../hooks/useStoreSettings";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { printVouchersDirect } from "../lib/escpos";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Card, CardContent } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
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
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Ticket,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const VoucherManagement = () => {
  const settings = useStoreSettings();
  const [vouchers, setVouchers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [selected, setSelected] = useState([]);
  const [bulkPrintList, setBulkPrintList] = useState(null);
  const [selectedVoucher, setSelectedVoucher] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchVouchers = useCallback(async () => {
    try {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const { data } = await axios.get(`${API_URL}/api/vouchers${params}`, {
        withCredentials: true,
      });
      setVouchers(data.vouchers || []);
    } catch (error) {
      toast.error("Gagal memuat data voucher");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);
  useAutoRefresh(fetchVouchers);

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
    if (isExpiringSoon(voucher, settings.expiry_warning_days)) {
      const days = Math.ceil((expiresAt - now) / 86400000);
      return (
        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100" data-testid={`badge-expiring-${voucher.code}`}>
          Segera Exp · {days} hari
        </Badge>
      );
    }
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Aktif</Badge>;
  };

  const STATUS_ORDER = { draft: 0, active: 1, redeemed: 2, expired: 3 };
  const sortValue = (v, key) => {
    if (key === "status") return STATUS_ORDER[v.status] ?? 9;
    if (key === "printed") return v.printed ? 1 : 0;
    if (key === "nominal") return v.nominal;
    if (key === "expires_at" || key === "created_at") return new Date(v[key]).getTime();
    return String(v[key] || "").toLowerCase();
  };

  const filteredVouchers = vouchers
    .filter((v) =>
      v.code.toLowerCase().includes(search.toLowerCase()) ||
      v.title.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const x = sortValue(a, sort.key), y = sortValue(b, sort.key);
      const cmp = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));

  const SORT_COLUMNS = [
    { key: "code", label: "Kode", className: "w-[90px]" },
    { key: "title", label: "Judul", className: "w-[60px]" },
    { key: "nominal", label: "Nominal", className: "w-[62px]" },
    { key: "status", label: "Status", className: "w-[150px]" },
    { key: "printed", label: "Dicetak", className: "flex-1" },
    { key: "expires_at", label: "Kadaluarsa", className: "w-[132px]" },
  ];

  const markPrinted = async (codes) => {
    try {
      await axios.post(`${API_URL}/api/vouchers/mark-printed`, { codes }, { withCredentials: true });
      setVouchers((prev) =>
        prev.map((v) => (codes.includes(v.code) ? { ...v, printed: true, status: v.status === "draft" ? "active" : v.status } : v))
      );
    } catch {
      toast.error("Gagal menandai voucher tercetak");
    }
  };

  const directPrint = async (list) => {
    try {
      await printVouchersDirect(list, settings);
      markPrinted(list.map((v) => v.code));
      toast.success(`${list.length} voucher dicetak (auto cut)`);
    } catch (err) {
      toast.error(`Agen cetak tidak terhubung: ${err.message}. Jalankan agen di PC ini atau ubah metode cetak di Pengaturan.`);
    }
  };

  const handlePrint = (voucher) => {
    if (settings.print_method === "agent") return directPrint([voucher]);
    setBulkPrintList(null);
    setSelectedVoucher(voucher);
    setTimeout(() => {
      window.print();
      markPrinted([voucher.code]);
    }, 300);
  };

  const toggleSelect = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const allSelected = filteredVouchers.length > 0 && filteredVouchers.every((v) => selected.includes(v._id));
  const toggleSelectAll = () =>
    setSelected(allSelected ? [] : filteredVouchers.map((v) => v._id));
  const selectedVouchers = vouchers.filter((v) => selected.includes(v._id));

  const handleBulkPrint = () => {
    if (selectedVouchers.length === 0) return;
    if (settings.print_method === "agent") return directPrint(selectedVouchers);
    setSelectedVoucher(null);
    setBulkPrintList(selectedVouchers);
    setTimeout(() => {
      window.print();
      markPrinted(selectedVouchers.map((v) => v.code));
      toast.success(`${selectedVouchers.length} voucher dikirim ke printer`);
    }, 300);
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;
    if (!window.confirm(`Hapus ${selected.length} voucher terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      const { data } = await axios.post(`${API_URL}/api/vouchers/bulk-delete`, { ids: selected }, { withCredentials: true });
      setVouchers((prev) => prev.filter((v) => !selected.includes(v._id)));
      setSelected([]);
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal menghapus voucher");
    }
  };

  const handleDelete = async (voucher) => {
    if (!window.confirm(`Hapus voucher ${voucher.code} (${formatCurrency(voucher.nominal)})? Tindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await axios.delete(`${API_URL}/api/vouchers/${voucher._id}`, { withCredentials: true });
      setVouchers((prev) => prev.filter((v) => v._id !== voucher._id));
      toast.success("Voucher berhasil dihapus");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal menghapus voucher");
    }
  };

  const handleViewDetail = (voucher) => {
    setBulkPrintList(null);
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
              <SelectItem value="draft" data-testid="filter-draft">Belum Dicetak</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="expiring" data-testid="filter-expiring">Segera Kadaluarsa</SelectItem>
              <SelectItem value="redeemed">Terpakai</SelectItem>
              <SelectItem value="expired">Kadaluarsa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border-2 border-black bg-yellow-100" data-testid="bulk-action-bar">
            <span className="font-bold" data-testid="bulk-selected-count">{selected.length} voucher dipilih</span>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" onClick={handleBulkPrint} data-testid="btn-bulk-print">
                <Printer className="w-4 h-4 mr-2" /> Cetak ({selected.length})
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} data-testid="btn-bulk-delete">
                <Trash2 className="w-4 h-4 mr-2" /> Hapus ({selected.length})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelected([])} data-testid="btn-bulk-clear">Batal</Button>
            </div>
          </div>
        )}

        {/* Voucher List */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={`skeleton-${i}`}>
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
            <div className="flex items-center gap-2 px-4 text-sm md:hidden">
              <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} data-testid="checkbox-select-all-mobile" />
              <span className="font-bold">Pilih semua</span>
            </div>
            <div className="hidden md:flex items-center gap-4 px-4 text-sm" data-testid="voucher-sort-header">
              <div className="w-5 flex-shrink-0 flex items-center">
                <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} data-testid="checkbox-select-all" />
              </div>
              <div className="w-16 flex-shrink-0" />
              {SORT_COLUMNS.slice(0, 3).map((c) => (
                <button key={c.key} type="button" onClick={() => toggleSort(c.key)}
                  className={`${c.className} flex items-center gap-1 font-bold text-left hover:underline ${sort.key === c.key ? "text-emerald-700" : ""}`}
                  data-testid={`sort-${c.key}`}>
                  {c.label}
                  {sort.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />}
                </button>
              ))}
              {SORT_COLUMNS.slice(3).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleSort(c.key)}
                  className={`${c.className} flex items-center gap-1 font-bold text-left hover:underline ${sort.key === c.key ? "text-emerald-700" : ""}`}
                  data-testid={`sort-${c.key}`}
                >
                  {c.label}
                  {sort.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />) : <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />}
                </button>
              ))}
            </div>
            {filteredVouchers.map((voucher) => (
              <Card 
                key={voucher._id} 
                className="border hover:shadow-sm transition-shadow"
                data-testid={`voucher-card-${voucher.code}`}
              >
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <Checkbox
                      checked={selected.includes(voucher._id)}
                      onCheckedChange={() => toggleSelect(voucher._id)}
                      data-testid={`checkbox-${voucher.code}`}
                    />
                    {/* QR Preview */}
                    <div className="w-16 h-16 bg-white border rounded flex-shrink-0 overflow-hidden">
                      <img
                        src={`data:image/png;base64,${voucher.qr_code}`}
                        alt="QR Code"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 sm:flex-none sm:w-[220px]">
                      <span className="font-mono font-bold text-sm block">{voucher.code}</span>
                      <p className="text-sm text-muted-foreground truncate">{voucher.title}</p>
                      <p className="font-semibold text-emerald-600 text-sm mt-0.5">{formatCurrency(voucher.nominal)}</p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 sm:order-last">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => handleDelete(voucher)}
                        data-testid={`btn-delete-${voucher.code}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Badges: fixed slots */}
                    <div className="w-full sm:w-auto sm:flex-1 grid grid-cols-[150px_1fr] items-center gap-2 text-xs sm:text-sm [&_*]:whitespace-nowrap">
                        <span data-testid={`status-slot-${voucher.code}`}>
                          {getStatusBadge(voucher)}
                        </span>
                        <span data-testid={`print-slot-${voucher.code}`}>
                          {voucher.printed ? (
                            <Badge variant="outline" className="gap-1" data-testid={`badge-printed-${voucher.code}`}><Printer className="w-3 h-3" /> Sudah dicetak</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-dashed text-gray-600" data-testid={`badge-unprinted-${voucher.code}`}><Printer className="w-3 h-3" /> Belum dicetak</Badge>
                          )}
                        </span>
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
                    <span className="text-muted-foreground">Dicetak</span>
                    <span data-testid="detail-printed">{selectedVoucher.printed ? (selectedVoucher.printed_at ? `Ya · ${formatDate(selectedVoucher.printed_at)}` : "Ya") : "Belum"}</span>
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

        {(bulkPrintList || selectedVoucher) && (
          <PrintPortal testId="print-template" settings={settings}>
            {bulkPrintList
              ? bulkPrintList.map((v, idx) => (
                  <PrintVoucher key={v.code} voucher={v} settings={settings} pageBreak={idx < bulkPrintList.length - 1} />
                ))
              : <PrintVoucher voucher={selectedVoucher} settings={settings} />}
          </PrintPortal>
        )}
      </div>
    </AdminLayout>
  );
};

export default VoucherManagement;
