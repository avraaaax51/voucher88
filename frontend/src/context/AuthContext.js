import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import axios from "axios";

const AuthContext = createContext(null);

const API_URL = process.env.REACT_APP_BACKEND_URL;

// Configure axios defaults
axios.defaults.withCredentials = true;

// Helper to format API errors
const formatApiError = (detail) => {
  if (detail == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth on mount
  const checkAuth = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`, { withCredentials: true });
      setUser(data);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (name, password) => {
    try {
      const { data } = await axios.post(
        `${API_URL}/api/auth/login`,
        { name, password },
        { withCredentials: true }
      );
      setUser(data);
      return { success: true, user: data };
    } catch (error) {
      const message = formatApiError(error.response?.data?.detail);
      return { success: false, error: message };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      // ignore network errors on logout; local state is cleared below
    } finally {
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({ user, loading, login, logout, checkAuth }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, loading, checkAuth]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
