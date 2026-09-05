import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Ticket,
  Users,
  BarChart3,
  Monitor,
  Settings as SettingsIcon,
  ScanLine,
  LogOut,
  Menu,
  Store,
  ChevronRight,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/vouchers", label: "Kelola Voucher", icon: Ticket },
  { href: "/admin/users", label: "Kelola User", icon: Users },
  { href: "/admin/reports", label: "Laporan", icon: BarChart3 },
  { href: "/admin/settings", label: "Pengaturan", icon: SettingsIcon },
];

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success("Berhasil logout");
    navigate("/login");
  };

  const isActive = (href) => {
    if (href === "/admin") {
      return location.pathname === "/admin";
    }
    return location.pathname.startsWith(href);
  };

  const NavLink = ({ item, onClick }) => (
    <Link
      to={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
        isActive(item.href)
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
      data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, "-")}`}
    >
      <item.icon className="w-5 h-5" />
      {item.label}
    </Link>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col border-r bg-card">
        <div className="flex flex-col flex-1 px-4 py-6">
          {/* Logo */}
          <Link to="/admin" className="flex items-center gap-3 px-2 mb-8">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Store className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-extrabold tracking-tight">Voucher88</span>
          </Link>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>

          {/* Cashier Mode Button */}
          <div className="pt-4 border-t">
            <Link to="/kasir">
              <Button 
                variant="outline" 
                className="w-full justify-between h-12 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                data-testid="btn-cashier-mode"
              >
                <span className="flex items-center gap-2">
                  <ScanLine className="w-5 h-5" />
                  Mode Kasir
                </span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {/* User Menu */}
          <div className="pt-4 mt-4 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                  data-testid="user-menu-trigger"
                >
                  <div
                    className="w-9 h-9 flex items-center justify-center bg-yellow-300 border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] -rotate-3"
                    data-testid="user-avatar-logo"
                  >
                    <Monitor className="w-5 h-5 text-black" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Akun Saya</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-red-600 focus:text-red-600"
                  data-testid="btn-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-card border-b z-40 px-4 flex items-center justify-between">
        <Link to="/admin" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Store className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-extrabold">Voucher88</span>
        </Link>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="mobile-menu-trigger">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="flex flex-col h-full px-4 py-6">
              {/* Logo */}
              <div className="flex items-center gap-3 px-2 mb-6">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                  <Store className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-extrabold">Voucher88</span>
              </div>

              {/* Navigation */}
              <nav className="flex-1 space-y-1">
                {navItems.map((item) => (
                  <NavLink 
                    key={item.href} 
                    item={item} 
                    onClick={() => setMobileOpen(false)}
                  />
                ))}
              </nav>

              {/* Cashier Mode */}
              <div className="pt-4 border-t">
                <Link to="/kasir" onClick={() => setMobileOpen(false)}>
                  <Button 
                    variant="outline" 
                    className="w-full justify-between h-12 border-emerald-200 text-emerald-700"
                  >
                    <span className="flex items-center gap-2">
                      <ScanLine className="w-5 h-5" />
                      Mode Kasir
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>

              {/* User */}
              <div className="pt-4 mt-4 border-t">
                <div className="flex items-center gap-3 px-2 mb-4">
                  <div className="w-9 h-9 flex items-center justify-center bg-yellow-300 border-2 border-black rounded-lg shadow-[2px_2px_0_0_#000] -rotate-3">
                    <Monitor className="w-5 h-5 text-black" strokeWidth={2.5} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{user?.role}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={handleLogout}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Main Content */}
      <main className="lg:pl-64">
        <div className="min-h-screen pt-20 lg:pt-8 pb-8 px-4 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
