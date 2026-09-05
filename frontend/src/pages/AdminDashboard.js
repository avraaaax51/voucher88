import { useState, useEffect, useCallback } from "react";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { Link } from "react-router-dom";
import axios from "axios";
import AdminLayout from "../components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Skeleton } from "../components/ui/skeleton";
import { toast } from "sonner";
import { 
  Ticket, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  TrendingUp,
  Plus,
  ArrowRight,
  Banknote
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/stats`, {
        withCredentials: true,
      });
      setStats(data);
    } catch (error) {
      toast.error("Gagal memuat statistik");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);
  useAutoRefresh(fetchStats);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={`skeleton-${i}`}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Ringkasan aktivitas voucher toko Anda
            </p>
          </div>
          <Link to="/admin/vouchers/create">
            <Button 
              className="h-11 px-6 font-semibold"
              data-testid="btn-create-voucher"
            >
              <Plus className="w-4 h-4 mr-2" />
              Buat Voucher Baru
            </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border hover:shadow-sm transition-shadow" data-testid="stat-total">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Voucher</p>
                  <p className="text-3xl font-bold mt-1">{stats?.total || 0}</p>
                </div>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Ticket className="w-6 h-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-sm transition-shadow" data-testid="stat-active">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Voucher Aktif</p>
                  <p className="text-3xl font-bold mt-1 text-emerald-600">{stats?.active || 0}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-sm transition-shadow" data-testid="stat-redeemed">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sudah Digunakan</p>
                  <p className="text-3xl font-bold mt-1">{stats?.redeemed || 0}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border hover:shadow-sm transition-shadow" data-testid="stat-expired">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Kadaluarsa</p>
                  <p className="text-3xl font-bold mt-1 text-red-600">{stats?.expired || 0}</p>
                </div>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Secondary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border" data-testid="stat-nominal">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Banknote className="w-7 h-7 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Nominal Terpakai</p>
                  <p className="text-2xl font-bold mt-1">
                    {formatCurrency(stats?.total_nominal_redeemed || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border" data-testid="stat-today">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Clock className="w-7 h-7 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Digunakan Hari Ini</p>
                  <p className="text-2xl font-bold mt-1">{stats?.today_redeemed || 0} voucher</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Redemptions */}
        <Card className="border">
          <CardHeader className="flex flex-row items-center justify-between pb-4">
            <CardTitle className="text-lg font-semibold">Penggunaan Terbaru</CardTitle>
            <Link to="/admin/reports">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                Lihat Semua
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {stats?.recent_redemptions?.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_redemptions.map((redemption, index) => (
                  <div 
                    key={redemption._id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    data-testid={`recent-redemption-${index}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{redemption.voucher_code}</p>
                        <p className="text-xs text-muted-foreground">
                          di-scan oleh {redemption.redeemed_by_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="secondary" className="font-semibold">
                        {formatCurrency(redemption.nominal)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDate(redemption.redeemed_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Ticket className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Belum ada voucher yang digunakan</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
