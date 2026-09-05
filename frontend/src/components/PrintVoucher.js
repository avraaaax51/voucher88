import { createPortal } from "react-dom";
import { DEFAULT_SETTINGS } from "../hooks/useStoreSettings";

// Renders children into #print-root (outside the app tree) so @media print can hide #root
export const PrintPortal = ({ children, testId, settings = {} }) => {
  const target = document.getElementById("print-root");
  if (!target) return null;
  const paper = Number(settings.print_paper_mm ?? DEFAULT_SETTINGS.print_paper_mm);
  return createPortal(
    <div className="print-sheet" data-testid={testId} style={{ width: `${paper}mm` }}>
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 0; } html, body, #print-root { width: ${paper}mm !important; } }`}</style>
      {children}
    </div>,
    target
  );
};

const F = "Arial, Helvetica, sans-serif";

const formatExpiry = (iso) =>
  new Date(iso)
    .toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    .toUpperCase();

const Notch = ({ side }) => (
  <div
    style={{
      width: "3.5mm",
      background: "#000",
      clipPath:
        side === "left"
          ? "polygon(0 0, 100% 0, 100% 100%, 0 100%, 60% 50%)"
          : "polygon(0 0, 100% 0, 40% 50%, 100% 100%, 0 100%)",
    }}
  />
);

export const PrintVoucher = ({ voucher, settings = {}, pageBreak = false }) => {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const paper = Number(s.print_paper_mm), width = Number(s.print_width_mm);
  const offset = Number(s.print_offset_mm) || 0;
  const scale = (Number(s.print_scale) || 100) / 100;
  const marginLeft = Math.max(0, (paper - width) / 2 + offset);
  const termsLines = (voucher.terms || `${s.promo_line1}\n${s.promo_line2}`)
    .split("\n")
    .filter(Boolean);
  const nameMatch = s.store_name.trim().match(/^(.*?)\s*(\d+)$/);
  const nameText = nameMatch ? nameMatch[1] : s.store_name;
  const nameNum = nameMatch ? nameMatch[2] : "";

  return (
    <div
      className="print-voucher-card"
      data-testid="print-voucher-card"
      style={{
        width: `${width}mm`,
        boxSizing: "border-box",
        marginLeft: `${marginLeft}mm`,
        marginRight: 0,
        padding: `1.5mm 0 ${Number(s.print_feed_mm)}mm`,
        background: "#fff",
        color: "#000",
        fontFamily: F,
        pageBreakAfter: pageBreak ? "always" : "auto",
        breakAfter: pageBreak ? "page" : "auto",
        breakInside: "avoid",
      }}
    >
      <div style={{ zoom: scale, border: "0.4mm solid #000", borderRadius: "2.5mm", padding: "4mm 3mm 3.5mm", boxSizing: "border-box", width: `${width / scale}mm` }}>
        <div style={{ textAlign: "center", lineHeight: 1 }}>
          <div style={{ fontSize: "18px", fontWeight: 700 }}>{s.store_prefix}</div>
          <div style={{ fontSize: "36px", fontWeight: 900, letterSpacing: "-1px", marginTop: "1mm" }}>
            {nameText}{nameNum && <span style={{ fontSize: "34px", marginLeft: "1mm" }}>{nameNum}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "2mm", marginTop: "1.5mm" }}>
            <span style={{ flex: 1, height: "0.5mm", background: "#000" }} />
            <span style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "2px" }}>{s.store_branch}</span>
            <span style={{ flex: 1, height: "0.5mm", background: "#000" }} />
          </div>
        </div>

        <div style={{ display: "flex", height: "9mm", marginTop: "3mm" }}>
          <Notch side="left" />
          <div
            style={{
              flex: 1,
              background: "#000",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "17px",
              fontWeight: 900,
              letterSpacing: "0.5px",
            }}
          >
            VOUCHER BELANJA
          </div>
          <Notch side="right" />
        </div>

        <div style={{ height: "0.4mm", background: "#000", margin: "3mm 0" }} />

        <div style={{ textAlign: "center", lineHeight: 1 }}>
          <div style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "1px" }}>NILAI VOUCHER</div>
          <div style={{ fontSize: "40px", fontWeight: 900, letterSpacing: "-1px", marginTop: "1.5mm" }}>
            Rp.{voucher.nominal.toLocaleString("id-ID")}
          </div>
        </div>

        {voucher.qr_code ? (
          <div style={{ display: "flex", justifyContent: "center", margin: "5mm 0" }}>
            <img
              src={`data:image/png;base64,${voucher.qr_code}`}
              alt={`QR ${voucher.code}`}
              style={{ width: "40mm", height: "40mm", display: "block" }}
            />
          </div>
        ) : (
          <div style={{ width: "40mm", height: "40mm", margin: "5mm auto", border: "0.4mm dashed #000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px" }}>QR CODE</div>
        )}

        <div
          style={{
            background: "#000",
            color: "#fff",
            borderRadius: "3mm",
            padding: "3mm 2mm",
            textAlign: "center",
            lineHeight: 1.25,
          }}
        >
          {termsLines.map((line, i) => (
            <div key={`${i}-${line}`} style={{ fontSize: i === 0 ? "15px" : "12px", fontWeight: 900 }}>
              {line}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            border: "0.5mm solid #000",
            borderRadius: "2.5mm",
            marginTop: "3mm",
            overflow: "hidden",
          }}
        >
          <div style={{ width: "14mm", display: "flex", alignItems: "center", justifyContent: "center", borderRight: "0.5mm solid #000" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.2" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <line x1="8" y1="3" x2="8" y2="7" />
              <line x1="16" y1="3" x2="16" y2="7" />
              <rect x="7" y="13" width="2" height="2" fill="#000" stroke="none" />
              <rect x="11" y="13" width="2" height="2" fill="#000" stroke="none" />
              <rect x="15" y="13" width="2" height="2" fill="#000" stroke="none" />
              <rect x="7" y="17" width="2" height="2" fill="#000" stroke="none" />
              <rect x="11" y="17" width="2" height="2" fill="#000" stroke="none" />
            </svg>
          </div>
          <div style={{ flex: 1, padding: "2mm 3mm", lineHeight: 1.15 }}>
            <div style={{ fontSize: "11px", fontWeight: 700 }}>BERLAKU SAMPAI</div>
            <div style={{ fontSize: "16px", fontWeight: 900, marginTop: "0.5mm" }}>{formatExpiry(voucher.expires_at)}</div>
          </div>
        </div>
      </div>
    </div>
  );
};
