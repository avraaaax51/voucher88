import { useState, useEffect, useCallback } from "react";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/AuthContext";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Loader2,
  Shield,
  ScanLine,
  KeyRound,
  Trash2,
  LogIn,
} from "lucide-react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

const UserManagement = () => {
  const { user: me } = useAuth();
  const isSuper = me?.role === "superadmin";
  const ROLE_LABEL = { superadmin: "Super Admin", admin: "Admin", kasir: "Kasir" };
  const canManage = (u) => u.role !== "superadmin" && (isSuper || u.role === "kasir");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginActivities, setLoginActivities] = useState([]);
  const [loginActivitiesLoading, setLoginActivitiesLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: "", pin: "" });
  const [resetLoading, setResetLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    role: "kasir",
    pin: "",
  });

  const fetchUsers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/users`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Gagal mengambil data user");
      const data = await response.json();
      setUsers(data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLoginActivities = useCallback(async () => {
    if (!isSuper) {
      setLoginActivities([]);
      return;
    }

    setLoginActivitiesLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/users/login-activities`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Gagal mengambil aktivitas login");
      }
      const data = await response.json();
      setLoginActivities(data.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoginActivitiesLoading(false);
    }
  }, [isSuper]);

  useEffect(() => {
    fetchUsers();
    fetchLoginActivities();
  }, [fetchLoginActivities, fetchUsers]);

  const handleDelete = async (u) => {
    if (!window.confirm(`Hapus user ${u.name}?`)) return;
    try {
      const res = await fetch(`${API_URL}/api/users/${u._id}`, { method: "DELETE", credentials: "include" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal menghapus user");
      toast.success(body.message);
      fetchUsers();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetLoading(true);
    try {
      const payload = { password: resetForm.password };
      const res = await fetch(`${API_URL}/api/users/${resetTarget._id}/reset`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || "Gagal mereset");
      toast.success(body.message);
      setResetTarget(null);
      setResetForm({ password: "", pin: "" });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRoleChange = (value) => {
    setFormData((prev) => ({ ...prev, role: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCreateLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Gagal membuat user");
      }

      toast.success("User berhasil dibuat");
      setDialogOpen(false);
      setFormData({
        email: "",
        password: "",
        name: "",
        role: "kasir",
        pin: "",
      });
      fetchUsers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreateLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const formatLoginDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Kelola User</h1>
            <p className="text-muted-foreground mt-1">
              Kelola admin dan kasir toko Anda
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="btn-add-user">
                <UserPlus className="w-4 h-4 mr-2" />
                Tambah User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tambah User Baru</DialogTitle>
                <DialogDescription>
                  Buat akun baru untuk admin atau kasir
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nama Lengkap</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder="Nama lengkap"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    data-testid="input-user-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Sandi (6 angka)</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    placeholder="6 angka"
                    value={formData.password}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                    required
                    minLength={6}
                    maxLength={6}
                    data-testid="input-user-password"
                  />
                  <p className="text-xs text-muted-foreground">Nama dipakai untuk login, sandi harus tepat 6 angka</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={handleRoleChange}
                  >
                    <SelectTrigger data-testid="select-user-role">
                      <SelectValue placeholder="Pilih role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kasir">Kasir</SelectItem>
                      {isSuper && <SelectItem value="admin">Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setDialogOpen(false)}
                    data-testid="btn-cancel-add-user"
                  >
                    Batal
                  </Button>
                  <Button
                    type="submit"
                    disabled={createLoading}
                    data-testid="btn-submit-user"
                  >
                    {createLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Menyimpan...
                      </>
                    ) : (
                      "Simpan"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{users.length}</p>
                  <p className="text-sm text-muted-foreground">Total User</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-100 rounded-lg">
                  <Shield className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {users.filter((u) => u.role !== "kasir").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Admin</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-emerald-100 rounded-lg">
                  <ScanLine className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {users.filter((u) => u.role === "kasir").length}
                  </p>
                  <p className="text-sm text-muted-foreground">Kasir</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card className="border">
          <CardHeader>
            <CardTitle>Daftar User</CardTitle>
            <CardDescription>
              Semua user yang terdaftar di sistem
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Belum ada user terdaftar</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Dibuat</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user._id} data-testid={`user-row-${user._id}`}>
                        <TableCell className="font-medium">
                          {user.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.role !== "kasir" ? "default" : "secondary"}
                            className={
                              user.role === "superadmin"
                                ? "bg-black text-yellow-300 hover:bg-black"
                                : user.role === "admin"
                                ? "bg-amber-100 text-amber-800 hover:bg-amber-100"
                                : "bg-emerald-100 text-emerald-800 hover:bg-emerald-100"
                            }
                          >
                            {user.role !== "kasir" ? (
                              <Shield className="w-3 h-3 mr-1" />
                            ) : (
                              <ScanLine className="w-3 h-3 mr-1" />
                            )}
                            {ROLE_LABEL[user.role] || user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(user.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {canManage(user) && (<>
                            <Button variant="ghost" size="icon" title="Reset sandi" onClick={() => setResetTarget(user)} data-testid={`btn-reset-user-${user._id}`}>
                              <KeyRound className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" title="Hapus user" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(user)} data-testid={`btn-delete-user-${user._id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            </>)}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {isSuper && (
          <Card className="border" data-testid="login-activities-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LogIn className="w-5 h-5" />
                Aktivitas Login User
              </CardTitle>
              <CardDescription>
                Riwayat masuk terbaru untuk seluruh akun.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loginActivitiesLoading ? (
                <div
                  className="flex items-center justify-center py-12"
                  data-testid="login-activities-loading"
                >
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : loginActivities.length === 0 ? (
                <div
                  className="py-10 text-center text-muted-foreground"
                  data-testid="login-activities-empty"
                >
                  Belum ada aktivitas login tercatat.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table data-testid="login-activities-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Waktu Login</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginActivities.map((activity, index) => (
                        <TableRow
                          key={`${activity.user_id}-${activity.logged_at}-${index}`}
                          data-testid={`login-activity-row-${index}`}
                        >
                          <TableCell
                            className="font-medium"
                            data-testid={`login-activity-name-${index}`}
                          >
                            {activity.name}
                          </TableCell>
                          <TableCell data-testid={`login-activity-role-${index}`}>
                            {ROLE_LABEL[activity.role] || activity.role}
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground"
                            data-testid={`login-activity-time-${index}`}
                          >
                            {formatLoginDate(activity.logged_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge
                              className="bg-emerald-600 text-white hover:bg-emerald-600"
                              data-testid={`login-activity-status-${index}`}
                            >
                              Login berhasil
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
          <DialogContent data-testid="reset-user-dialog">
            <DialogHeader>
              <DialogTitle>Reset Sandi</DialogTitle>
              <DialogDescription>Sandi baru untuk {resetTarget?.name} (6 angka).</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">Sandi Baru (6 angka)</Label>
                <Input id="reset-password" type="password" inputMode="numeric" maxLength={6} value={resetForm.password} onChange={(e) => setResetForm((p) => ({ ...p, password: e.target.value.replace(/\D/g, "").slice(0, 6) }))} placeholder="6 angka" data-testid="input-reset-password" />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={resetLoading || resetForm.password.length !== 6} data-testid="btn-submit-reset">
                  {resetLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Simpan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default UserManagement;
