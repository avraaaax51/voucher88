import { useEffect, useState } from "react";

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const DEFAULT_SETTINGS = {
  store_prefix: "Toko",
  store_name: "ANEKA 88",
  store_branch: "MANGON",
  promo_line1: "BELANJA LEBIH HEMAT",
  promo_line2: "DI TOKO ANEKA 88 MANGON",
  expiry_warning_days: 7,
  print_paper_mm: 80,
  print_width_mm: 72,
  print_offset_mm: 0,
  print_scale: 100,
  print_feed_mm: 6,
};

export const useStoreSettings = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(() => {
    fetch(`${API_URL}/api/settings`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setSettings(data))
      .catch(() => {});
  }, []);

  return settings;
};

export const isExpiringSoon = (voucher, days) => {
  if (voucher.status !== "active") return false;
  const diff = new Date(voucher.expires_at) - new Date();
  return diff > 0 && diff <= days * 86400000;
};
