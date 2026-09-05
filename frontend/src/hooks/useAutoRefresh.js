import { useEffect } from "react";

// Re-run fn when tab regains focus/visibility and every `intervalMs`
export const useAutoRefresh = (fn, intervalMs = 30000) => {
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") fn();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(onVisible, intervalMs);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(id);
    };
  }, [fn, intervalMs]);
};
