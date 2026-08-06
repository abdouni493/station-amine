/* ============================================================================
 * Shared print / PDF utilities
 * ----------------------------------------------------------------------------
 * The app is styled with Tailwind CSS v4, which emits modern `oklch()` colours
 * for every default palette entry. html2canvas (1.4.x) cannot parse `oklch()`
 * and throws mid-capture, which silently broke EVERY "Télécharger PDF" button.
 *
 * `exportElementToPdf` captures any DOM node to a clean multi-page A4 PDF and
 * neutralises every `oklch()` colour to its `rgb()` equivalent inside the
 * html2canvas clone, so the export works regardless of the Tailwind palette.
 *
 * `printDocumentMode` flips the <body> into "document" print mode so the
 * full-page A4 fiches print correctly instead of being hidden by the global
 * thermal-receipt print stylesheet (see index.css @media print).
 * ========================================================================== */
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

/* ---------- oklch → rgb conversion ---------------------------------------- */
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function oklchToRgb(L: number, C: number, H: number): [number, number, number] {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const gamma = (x: number) =>
    x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;

  r = clamp01(gamma(r));
  g = clamp01(gamma(g));
  bl = clamp01(gamma(bl));
  return [Math.round(r * 255), Math.round(g * 255), Math.round(bl * 255)];
}

function parseComponent(tok: string, ref = 1): number {
  tok = tok.trim();
  if (tok === "none") return 0;
  if (tok.endsWith("%")) return (parseFloat(tok) / 100) * ref;
  return parseFloat(tok);
}

/** Replace every `oklch(...)` occurrence inside a CSS value with rgb()/rgba(). */
export function replaceOklch(value: string): string {
  if (!value || value.indexOf("oklch") === -1) return value;
  return value.replace(/oklch\(([^)]+)\)/gi, (_m, inner: string) => {
    let alpha = 1;
    let body = inner;
    const slash = inner.split("/");
    if (slash.length === 2) {
      body = slash[0];
      alpha = parseComponent(slash[1], 1);
    }
    const parts = body.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return "rgb(0,0,0)";
    const L = parseComponent(parts[0], 1); // lightness 0..1
    const C = parts[1].endsWith("%")
      ? (parseFloat(parts[1]) / 100) * 0.4
      : parseFloat(parts[1]); // chroma
    const H = parseFloat(parts[2]) || 0; // hue deg
    const [r, g, b] = oklchToRgb(L, C, H);
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
  });
}

const COLOR_PROPS = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "columnRuleColor",
  "fill",
  "stroke",
  "caretColor",
] as const;

/** Convert every computed `oklch()` colour in a cloned document to inline rgb. */
function neutralizeOklch(doc: Document) {
  const view = doc.defaultView || window;
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const cs = view.getComputedStyle(el);
    for (const prop of COLOR_PROPS) {
      const v = cs[prop as any] as string;
      if (v && v.indexOf("oklch") !== -1) (el.style as any)[prop] = replaceOklch(v);
    }
    const bg = cs.backgroundImage;
    if (bg && bg.indexOf("oklch") !== -1) el.style.backgroundImage = replaceOklch(bg);
    const sh = cs.boxShadow;
    if (sh && sh.indexOf("oklch") !== -1) el.style.boxShadow = replaceOklch(sh);
  });
}

/* ---------- PDF export ----------------------------------------------------- */
export interface ExportPdfOptions {
  /** Optional running header drawn on every page (e.g. station + period). */
  header?: string;
  /** Capture resolution multiplier (default 2). */
  scale?: number;
  /**
   * Page-fitting strategy:
   *  - "paginate" (default): slice the capture across as many A4 pages as needed.
   *  - "single": scale the whole capture down to fit a single A4 page.
   */
  fit?: "paginate" | "single";
  /** Page margin in mm (default 10). Use a small value for a full-bleed look. */
  margin?: number;
}

/**
 * Capture an element to a clean, paginated A4 PDF and trigger the download.
 * Returns true on success, false on failure (caller can show a toast).
 */
export async function exportElementToPdf(
  element: HTMLElement,
  filename: string,
  opts: ExportPdfOptions = {}
): Promise<boolean> {
  const prev = {
    overflow: element.style.overflow,
    height: element.style.height,
    maxHeight: element.style.maxHeight,
  };
  element.style.overflow = "visible";
  element.style.height = "auto";
  element.style.maxHeight = "none";

  try {
    const canvas = await html2canvas(element, {
      scale: opts.scale ?? 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      onclone: (doc) => neutralizeOklch(doc),
    });

    const pdf = new jsPDF("p", "mm", "a4");
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = opts.margin ?? 10;
    const headerH = opts.header ? 12 : 0;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2 - headerH;
    const fullImgH = (canvas.height * contentW) / canvas.width;

    // ── Single-page mode: scale the whole capture to fit one A4 page ──────────
    if (opts.fit === "single") {
      if (opts.header) {
        pdf.setFillColor(0, 18, 51);
        pdf.rect(0, 0, pageW, headerH, "F");
        pdf.setTextColor(255, 184, 0);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text(opts.header, margin, headerH - 4);
      }
      let drawW = contentW;
      let drawH = fullImgH;
      if (drawH > contentH) {
        const ratio = contentH / drawH;
        drawH = contentH;
        drawW = contentW * ratio;
      }
      const offsetX = margin + (contentW - drawW) / 2;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", offsetX, margin + headerH, drawW, drawH);
      pdf.save(filename);
      return true;
    }

    let consumed = 0; // mm of the full image already placed
    let page = 0;
    while (consumed < fullImgH - 0.5) {
      if (page > 0) pdf.addPage();
      if (opts.header) {
        pdf.setFillColor(0, 18, 51); // blue-900
        pdf.rect(0, 0, pageW, headerH, "F");
        pdf.setTextColor(255, 184, 0); // gold
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.text(opts.header, margin, headerH - 4);
        pdf.setTextColor(255, 255, 255);
        pdf.text(`Page ${page + 1}`, pageW - margin - 14, headerH - 4);
      }
      const sliceMM = Math.min(contentH, fullImgH - consumed);
      const srcY = (consumed / fullImgH) * canvas.height;
      const srcH = (sliceMM / fullImgH) * canvas.height;

      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = Math.max(1, Math.round(srcH));
      const ctx = slice.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, slice.width, slice.height);

      pdf.addImage(
        slice.toDataURL("image/png"),
        "PNG",
        margin,
        margin + headerH,
        contentW,
        sliceMM
      );
      consumed += sliceMM;
      page++;
    }

    pdf.save(filename);
    return true;
  } catch (err) {
    console.error("[pdf] export failed:", err);
    return false;
  } finally {
    element.style.overflow = prev.overflow;
    element.style.height = prev.height;
    element.style.maxHeight = prev.maxHeight;
  }
}

/* ---------- Document (A4) printing ---------------------------------------- */
/**
 * Print a full-page A4 document (fiche de brigade / fiche journalière). Adds a
 * <body> class so the global thermal-receipt print stylesheet is bypassed and
 * the document is rendered on A4 pages, then auto-removes it after printing.
 */
export function printDocumentMode() {
  document.body.classList.add("print-document");
  const cleanup = () => {
    document.body.classList.remove("print-document");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.print();
}
