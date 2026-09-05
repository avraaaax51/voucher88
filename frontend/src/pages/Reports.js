import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../components/AdminLayout";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { toast } from "sonner";
import {
  BarChart3,
  TrendingUp,
  Calendar,
  Loader2,
  Download,
  DollarSign,
  Ticket,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const Reports = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [dailyReport, setDailyReport] = useState([]);
  const [dateRange, setDateRange] = useState({
    start_date: "",
    end_date: "",
  });

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/stats`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Gagal mengambil statistik");
      const data = await response.json();
      setStats(data);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  const fetchDailyReport = useCallback(async (range = {}) => {
    try {
      let url = `${API_URL}/api/reports/daily`;
      const params = new URLSearchParams();
      if (range.start_date) params.append("start_date", range.start_date);
      if (range.end_date) params.append("end_date", range.end_date);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Gagal mengambil laporan harian");
      const data = await response.json();
      setDailyReport(data.report || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchStats(), fetchDailyReport()]);
  }, [fetchStats, fetchDailyReport]);

  const handleDateFilter = () => {
    setLoading(true);
    fetchDailyReport(dateRange);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString("id-ID", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const exportCSV = () => {
    if (dailyReport.length === 0) {
      toast.error("Tidak ada data untuk diekspor");
      return;
    }

    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const headers = ["Tanggal", "Jumlah Redemption", "Total Nominal (Rp)"];
    const rows = dailyReport.map((r) => [formatDate(r.date), r.count, r.total_nominal]);
    const totalCount = dailyReport.reduce((a, r) => a + r.count, 0);
    const totalNominal = dailyReport.reduce((a, r) => a + r.total_nominal, 0);
    const period = `Periode: ${dateRange.start_date || "30 hari terakhir"}${dateRange.end_date ? ` s/d ${dateRange.end_date}` : ""}`;

    const csvContent = [
      ["Laporan Redemption Voucher"],
      [period],
      [],
      headers,
      ...rows,
      [],
      ["TOTAL", totalCount, totalNominal],
    ]
      .map((row) => row.map(esc).join(";"))
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-redemption-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    toast.success("Laporan berhasil diunduh");
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Laporan</h1>
            <p className="text-muted-foreground mt-1">
              Statistik dan laporan penggunaan voucher
            </p>
          </div>
          <Button
            variant="outline"
            onClick={exportCSV}
            disabled={dailyReport.length === 0}
            data-testid="btn-export-csv"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Total Nominal Highlight */}
        <Card className="border bg-amber-300" data-testid="total-nominal-card">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-black rounded-2xl">
                <DollarSign className="w-9 h-9 text-amber-300" />
              </div>
              <div>
                <p className="text-sm font-bold uppercase tracking-wider">Total Nominal Voucher Terpakai</p>
                <p className="text-4xl sm:text-5xl font-extrabold leading-tight" data-testid="total-nominal-value">
                  {formatCurrency(stats?.total_nominal_redeemed || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Ticket className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total Voucher</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.active || 0}</p>
                  <p className="text-sm text-muted-foreground">Voucher Aktif</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats?.redeemed || 0}</p>
                  <p className="text-sm text-muted-foreground">Telah Digunakan</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Today's Highlight */}
        <Card className="border bg-gradient-to-r from-emerald-50 to-emerald-100/50">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-700">
                  Redemption Hari Ini
                </p>
                <p className="text-4xl font-extrabold text-emerald-800">
                  {stats?.today_redeemed || 0}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">
                  {new Date().toLocaleDateString("id-ID", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Date Filter */}
        <Card className="border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Filter Tanggal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <Label htmlFor="start_date">Dari Tanggal</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={dateRange.start_date}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      start_date: e.target.value,
                    }))
                  }
                  data-testid="input-start-date"
                />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="end_date">Sampai Tanggal</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={dateRange.end_date}
                  onChange={(e) =>
                    setDateRange((prev) => ({
                      ...prev,
                      end_date: e.target.value,
                    }))
                  }
                  data-testid="input-end-date"
                />
              </div>
              <Button
                onClick={handleDateFilter}
                className="min-w-24"
                data-testid="btn-apply-filter"
              >
                Terapkan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Daily Report Table */}
        <Card className="border">
          <CardHeader>
            <CardTitle>Laporan Harian</CardTitle>
            <CardDescription>
              Data redemption voucher per hari (30 hari terakhir)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : dailyReport.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada data redemption</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Jumlah Redemption</TableHead>
                      <TableHead className="text-right">Total Nominal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyReport.map((row) => (
                      <TableRow key={row.date} data-testid={`report-row-${row.date}`}>
                        <TableCell className="font-medium">
                          {formatDate(row.date)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.count}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-600">
                          {formatCurrency(row.total_nominal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Redemptions */}
        {stats?.recent_redemptions && stats.recent_redemptions.length > 0 && (
          <Card className="border">
            <CardHeader>
              <CardTitle>Redemption Terbaru</CardTitle>
              <CardDescription>
                10 transaksi redemption terakhir
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode Voucher</TableHead>
                      <TableHead>Nominal</TableHead>
                      <TableHead>Kasir</TableHead>
                      <TableHead>Waktu</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.recent_redemptions.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="font-mono font-medium">
                          {r.voucher_code}
                        </TableCell>
                        <TableCell className="text-emerald-600 font-medium">
                          {formatCurrency(r.nominal)}
                        </TableCell>
                        <TableCell>{r.redeemed_by_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(r.redeemed_at).toLocaleString("id-ID")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default Reports;
