// ReportBuilder — wraps jsPDF + jspdf-autotable and renders a declarative
// ReportDefinition (see ./types) into a themed PDF. This is the ONLY module
// that talks to jsPDF; every Plan report shares it, which is what guarantees
// consistent formatting across record types.

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CellHookData } from 'jspdf-autotable';

import {
  PAGE,
  CONTENT_WIDTH,
  CONTENT_TOP,
  CONTENT_BOTTOM,
  COLORS,
  FONT,
  SPACE,
  toneStyle,
  tint,
  displayTimestamp,
  type RGB,
  type Tone,
} from './theme';
import type {
  ReportDefinition,
  ReportMeta,
  ReportBlock,
  KpiItem,
  ReportField,
  TableBlock,
  TableCell,
  BarsBlock,
  RadarBlock,
} from './types';

const LEFT = PAGE.margin.left;
const RIGHT = PAGE.width - PAGE.margin.right;

interface AutoTableState {
  lastAutoTable?: { finalY: number };
}

export class ReportBuilder {
  private doc: jsPDF;
  private y: number = CONTENT_TOP;
  private accent: RGB = COLORS.brand;
  private generatedAt: Date = new Date();

  constructor() {
    this.doc = new jsPDF({
      orientation: PAGE.orientation,
      unit: PAGE.unit,
      format: PAGE.format,
    });
    this.doc.setFont(FONT.family, 'normal');
  }

  build(def: ReportDefinition, generatedAt: Date = new Date()): jsPDF {
    this.generatedAt = generatedAt;
    this.accent = def.meta.accent ?? COLORS.brand;
    this.renderCover(def.meta);
    this.doc.addPage();
    this.y = CONTENT_TOP;
    for (const block of def.blocks) this.renderBlock(block);
    this.renderFooters();
    return this.doc;
  }

  // --- low-level helpers ----------------------------------------------------

  private fill(rgb: RGB) {
    this.doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  }
  private draw(rgb: RGB) {
    this.doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  }
  private ink(rgb: RGB) {
    this.doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  }
  private font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
    this.doc.setFont(FONT.family, style);
    this.doc.setFontSize(size);
  }

  /** Move to a fresh content page if `height` won't fit in the current one. */
  private need(height: number) {
    if (this.y + height > CONTENT_BOTTOM) {
      this.doc.addPage();
      this.y = CONTENT_TOP;
    }
  }

  private badge(x: number, y: number, text: string, tone: Tone): number {
    const { fg, bg } = toneStyle(tone);
    this.font(FONT.tiny, 'bold');
    const padX = 6;
    const w = this.doc.getTextWidth(text.toUpperCase()) + padX * 2;
    const h = 15;
    this.fill(bg);
    this.doc.roundedRect(x, y, w, h, 3, 3, 'F');
    this.ink(fg);
    this.doc.text(text.toUpperCase(), x + padX, y + h / 2 + 2.5);
    return w;
  }

  // --- cover ----------------------------------------------------------------

  private renderCover(meta: ReportMeta) {
    // Top + bottom accent bands.
    this.fill(this.accent);
    this.doc.rect(0, 0, PAGE.width, 6, 'F');
    this.doc.rect(0, PAGE.height - 6, PAGE.width, 6, 'F');

    let y = 150;

    this.font(FONT.coverEyebrow, 'bold');
    this.ink(this.accent);
    this.doc.text(meta.recordType.toUpperCase(), LEFT, y, { charSpace: 1.2 });

    y += 30;
    this.font(FONT.coverTitle, 'bold');
    this.ink(COLORS.ink);
    const titleLines = this.doc.splitTextToSize(meta.title, CONTENT_WIDTH);
    this.doc.text(titleLines, LEFT, y);
    y += titleLines.length * (FONT.coverTitle * 1.15);

    if (meta.subtitle) {
      y += 6;
      this.font(FONT.coverSubtitle, 'normal');
      this.ink(COLORS.muted);
      const subLines = this.doc.splitTextToSize(meta.subtitle, CONTENT_WIDTH);
      this.doc.text(subLines, LEFT, y);
      y += subLines.length * (FONT.coverSubtitle * 1.35);
    }

    if (meta.status) {
      y += 14;
      this.badge(LEFT, y, meta.status, meta.statusTone ?? 'info');
      y += 24;
    }

    // Meta panel near the lower third.
    if (meta.fields && meta.fields.length) {
      const panelTop = 520;
      const cols = 2;
      const rowH = 34;
      const rows = Math.ceil(meta.fields.length / cols);
      const panelH = rows * rowH + 24;
      this.fill(COLORS.panel);
      this.draw(COLORS.line);
      this.doc.setLineWidth(0.75);
      this.doc.roundedRect(LEFT, panelTop, CONTENT_WIDTH, panelH, 8, 8, 'FD');

      const colW = CONTENT_WIDTH / cols;
      meta.fields.forEach((f, i) => {
        const cx = LEFT + (i % cols) * colW + 16;
        const cy = panelTop + 16 + Math.floor(i / cols) * rowH;
        this.font(FONT.kpiLabel, 'bold');
        this.ink(COLORS.faint);
        this.doc.text(f.label.toUpperCase(), cx, cy + 4, { charSpace: 0.6 });
        this.font(FONT.body, 'normal');
        this.ink(COLORS.body);
        const val = this.doc.splitTextToSize(f.value || '—', colW - 32);
        this.doc.text(val[0] ?? '—', cx, cy + 18);
      });
    }

    // Generated line above the bottom band.
    this.font(FONT.small, 'normal');
    this.ink(COLORS.faint);
    this.doc.text(
      `Confidential · Generated ${displayTimestamp(this.generatedAt)}`,
      LEFT,
      PAGE.height - 20,
    );
  }

  // --- block dispatch -------------------------------------------------------

  private renderBlock(block: ReportBlock) {
    switch (block.kind) {
      case 'heading':
        return this.heading(block.text);
      case 'paragraph':
        return this.paragraph(block.text, block.muted);
      case 'kpis':
        return this.kpis(block.items, block.columns ?? 3);
      case 'keyValues':
        return this.keyValues(block.rows, block.columns ?? 2);
      case 'table':
        return this.table(block);
      case 'bars':
        return this.bars(block);
      case 'radar':
        return this.radar(block);
      case 'divider':
        return this.divider();
    }
  }

  private heading(text: string) {
    this.need(FONT.h1 + SPACE.headingGap + 10);
    this.y += 4;
    // Accent tick.
    this.fill(this.accent);
    this.doc.rect(LEFT, this.y - FONT.h1 + 2, 3.5, FONT.h1, 'F');
    this.font(FONT.h1, 'bold');
    this.ink(COLORS.ink);
    this.doc.text(text, LEFT + 10, this.y);
    this.y += SPACE.headingGap;
    this.draw(COLORS.line);
    this.doc.setLineWidth(0.75);
    this.doc.line(LEFT, this.y, RIGHT, this.y);
    this.y += SPACE.headingGap;
  }

  private paragraph(text: string, muted = false) {
    this.font(FONT.body, 'normal');
    this.ink(muted ? COLORS.muted : COLORS.body);
    const lineH = FONT.body * 1.4;
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH);
    for (const line of lines) {
      this.need(lineH);
      this.doc.text(line, LEFT, this.y);
      this.y += lineH;
    }
    this.y += SPACE.paraGap;
  }

  private kpis(items: KpiItem[], columns: number) {
    const gap = SPACE.kpiGap;
    const cardW = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const cardH = SPACE.kpiHeight;
    for (let i = 0; i < items.length; i += columns) {
      const row = items.slice(i, i + columns);
      this.need(cardH + gap);
      row.forEach((item, j) => {
        const x = LEFT + j * (cardW + gap);
        const { fg, bg } = toneStyle(item.tone ?? 'default');
        this.fill(bg);
        this.draw(COLORS.line);
        this.doc.setLineWidth(0.75);
        this.doc.roundedRect(x, this.y, cardW, cardH, 6, 6, 'FD');
        this.font(FONT.kpiLabel, 'bold');
        this.ink(COLORS.faint);
        this.doc.text(item.label.toUpperCase(), x + 10, this.y + 15, { charSpace: 0.5 });
        this.font(FONT.kpiValue, 'bold');
        this.ink(item.tone && item.tone !== 'default' ? fg : COLORS.ink);
        this.doc.text(item.value, x + 10, this.y + 35);
        if (item.hint) {
          this.font(FONT.tiny, 'normal');
          this.ink(COLORS.faint);
          this.doc.text(item.hint, x + 10, this.y + 47);
        }
      });
      this.y += cardH + gap;
    }
    this.y += SPACE.blockGap - gap;
  }

  private keyValues(rows: ReportField[], columns: number) {
    const colW = CONTENT_WIDTH / columns;
    const rowH = 30;
    for (let i = 0; i < rows.length; i += columns) {
      const group = rows.slice(i, i + columns);
      this.need(rowH);
      group.forEach((f, j) => {
        const x = LEFT + j * colW;
        this.font(FONT.kpiLabel, 'bold');
        this.ink(COLORS.faint);
        this.doc.text(f.label.toUpperCase(), x, this.y + 4, { charSpace: 0.5 });
        this.font(FONT.body, 'normal');
        this.ink(COLORS.body);
        const val = this.doc.splitTextToSize(f.value || '—', colW - 12);
        this.doc.text(val[0] ?? '—', x, this.y + 18);
      });
      this.y += rowH;
    }
    this.y += SPACE.blockGap - 8;
  }

  private table(block: TableBlock) {
    if (block.caption) {
      this.need(FONT.small + 6);
      this.font(FONT.small, 'italic');
      this.ink(COLORS.muted);
      this.doc.text(block.caption, LEFT, this.y);
      this.y += FONT.small + 4;
    }

    const lastIdx = block.rows.length - 1;
    const columnStyles: Record<string, { halign: 'left' | 'right' | 'center' }> = {};
    block.columns.forEach((c, i) => {
      if (c.align) columnStyles[i] = { halign: c.align };
    });

    autoTable(this.doc, {
      startY: this.y,
      margin: { left: LEFT, right: PAGE.margin.right, top: CONTENT_TOP, bottom: PAGE.margin.bottom + 8 },
      head: [block.columns.map((c) => c.header)],
      body: block.rows.map((r) => r.map((cell) => cellText(cell))),
      theme: 'grid',
      styles: {
        font: FONT.family,
        fontSize: FONT.small,
        cellPadding: 5,
        lineColor: COLORS.line,
        lineWidth: 0.5,
        textColor: COLORS.body,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: this.accent,
        textColor: COLORS.white,
        fontStyle: 'bold',
        fontSize: FONT.tiny,
        halign: 'left',
      },
      alternateRowStyles: { fillColor: COLORS.panel },
      columnStyles,
      didParseCell: (data: CellHookData) => {
        if (data.section !== 'body') return;
        const cell = block.rows[data.row.index]?.[data.column.index];
        if (cell && typeof cell === 'object') {
          if (cell.tone) data.cell.styles.textColor = toneStyle(cell.tone).fg;
          if (cell.bold) data.cell.styles.fontStyle = 'bold';
          if (cell.align) data.cell.styles.halign = cell.align;
        }
        if (block.emphasizeLastRow && data.row.index === lastIdx) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = tint(this.accent, 0.86);
        }
      },
    });

    const finalY = (this.doc as unknown as AutoTableState).lastAutoTable?.finalY;
    this.y = (finalY ?? this.y) + SPACE.afterTable;
  }

  private bars(block: BarsBlock) {
    const rowH = 20;
    const titleH = block.title ? FONT.h2 + 8 : 0;
    this.need(titleH + block.data.length * rowH + 8);

    if (block.title) {
      this.font(FONT.h2, 'bold');
      this.ink(COLORS.ink);
      this.doc.text(block.title, LEFT, this.y);
      this.y += FONT.h2 + 8;
    }

    const labelW = 128;
    const valueW = 62;
    const trackX = LEFT + labelW;
    const trackW = CONTENT_WIDTH - labelW - valueW;

    const vals = block.data.map((d) => d.value);
    const maxV = Math.max(0, ...vals, block.max ?? 0);
    const minV = Math.min(0, ...vals);
    const span = maxV - minV || 1;
    const zeroX = trackX + ((0 - minV) / span) * trackW;

    const fmt = block.format ?? ((v: number) => `${block.unit ?? ''}${v}`);

    for (const d of block.data) {
      const barH = 9;
      const midY = this.y + rowH / 2;

      this.font(FONT.small, 'normal');
      this.ink(COLORS.body);
      const label = this.doc.splitTextToSize(d.label, labelW - 6)[0] ?? d.label;
      this.doc.text(label, LEFT, midY + 3);

      // Track baseline.
      this.draw(COLORS.line);
      this.doc.setLineWidth(0.5);
      this.doc.line(zeroX, this.y + 3, zeroX, this.y + rowH - 3);

      const len = (d.value / span) * trackW;
      const tone = d.tone ?? (d.value < 0 ? 'negative' : 'default');
      const color = tone === 'default' ? this.accent : toneStyle(tone).fg;
      this.fill(color);
      const bx = d.value >= 0 ? zeroX : zeroX + len;
      this.doc.roundedRect(bx, midY - barH / 2, Math.max(1, Math.abs(len)), barH, 1.5, 1.5, 'F');

      this.font(FONT.small, 'bold');
      this.ink(COLORS.body);
      this.doc.text(fmt(d.value), RIGHT, midY + 3, { align: 'right' });

      this.y += rowH;
    }
    this.y += SPACE.afterChart;
  }

  private radar(block: RadarBlock) {
    const n = block.axes.length;
    if (n < 3) return; // radar needs at least a triangle
    const titleH = block.title ? FONT.h2 + 8 : 0;
    const radius = 84;
    const labelPad = 40;
    const totalH = titleH + (radius + labelPad) * 2;
    this.need(totalH + 8);

    if (block.title) {
      this.font(FONT.h2, 'bold');
      this.ink(COLORS.ink);
      this.doc.text(block.title, LEFT, this.y);
      this.y += FONT.h2 + 8;
    }

    const cx = LEFT + CONTENT_WIDTH / 2;
    const cy = this.y + labelPad + radius;
    const max = block.max ?? Math.max(1, ...block.axes.map((a) => a.value));

    const pointAt = (i: number, r: number): [number, number] => {
      const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    };

    // Grid rings.
    this.draw(COLORS.line);
    this.doc.setLineWidth(0.5);
    for (const frac of [0.25, 0.5, 0.75, 1]) {
      const pts = Array.from({ length: n }, (_, i) => pointAt(i, radius * frac));
      for (let i = 0; i < n; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        this.doc.line(x1, y1, x2, y2);
      }
    }
    // Spokes.
    for (let i = 0; i < n; i++) {
      const [x, y] = pointAt(i, radius);
      this.doc.line(cx, cy, x, y);
    }

    // Data polygon (triangle fan from center → star-shaped, always valid here).
    const dataPts = block.axes.map((a, i) => pointAt(i, (Math.max(0, a.value) / max) * radius));
    this.fill(tint(this.accent, 0.72));
    for (let i = 0; i < n; i++) {
      const [x1, y1] = dataPts[i];
      const [x2, y2] = dataPts[(i + 1) % n];
      this.doc.triangle(cx, cy, x1, y1, x2, y2, 'F');
    }
    this.draw(this.accent);
    this.doc.setLineWidth(1.2);
    for (let i = 0; i < n; i++) {
      const [x1, y1] = dataPts[i];
      const [x2, y2] = dataPts[(i + 1) % n];
      this.doc.line(x1, y1, x2, y2);
    }

    // Axis labels.
    this.font(FONT.tiny, 'bold');
    this.ink(COLORS.muted);
    block.axes.forEach((a, i) => {
      const [lx, ly] = pointAt(i, radius + 12);
      const cos = Math.cos(-Math.PI / 2 + (i / n) * Math.PI * 2);
      const align: 'left' | 'right' | 'center' = cos > 0.3 ? 'left' : cos < -0.3 ? 'right' : 'center';
      this.doc.text(a.label, lx, ly + 2, { align });
    });

    this.y = cy + radius + labelPad;
    this.y += SPACE.afterChart - 8;
  }

  private divider() {
    this.need(SPACE.blockGap);
    this.draw(COLORS.line);
    this.doc.setLineWidth(0.5);
    this.doc.line(LEFT, this.y, RIGHT, this.y);
    this.y += SPACE.blockGap;
  }

  // --- footers (page numbers), drawn once all pages exist -------------------

  private renderFooters() {
    const total = this.doc.getNumberOfPages();
    for (let p = 2; p <= total; p++) {
      this.doc.setPage(p);
      this.draw(COLORS.line);
      this.doc.setLineWidth(0.5);
      const fy = PAGE.height - PAGE.margin.bottom + 4;
      this.doc.line(LEFT, fy, RIGHT, fy);
      this.font(FONT.tiny, 'normal');
      this.ink(COLORS.faint);
      this.doc.text(`Confidential · Generated ${displayTimestamp(this.generatedAt)}`, LEFT, fy + 12);
      this.doc.text(`Page ${p - 1} of ${total - 1}`, RIGHT, fy + 12, { align: 'right' });
    }
  }
}

// --- module helpers ---------------------------------------------------------

function cellText(cell: TableCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'object') return cell.text;
  return String(cell);
}
