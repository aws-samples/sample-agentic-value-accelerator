/**
 * reportExport - PDF and Word document generation for compliance reports
 *
 * Generates professionally formatted compliance reports with:
 * - Cover page with framework details
 * - Executive summary with compliance score
 * - Detailed requirement breakdown by category
 * - Control mapping tables
 * - Evidence inventory
 * - Gap analysis with remediation guidance
 * - Appendices
 */

import jsPDF from 'jspdf';
import {
  SAMPLE_TITLE,
  SAMPLE_FOOTER_MARK,
  sampleBannerLines,
} from '../compliance/exportProvenance';
import autoTable from 'jspdf-autotable';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  ShadingType,
  PageBreak,
  Header,
  Footer,
  PageNumber,
} from 'docx';
/**
 * Trigger a browser download for a Blob. The `file-saver` package ships no type
 * declarations and resolves to an untyped module, so we inline the equivalent
 * modern-browser download that file-saver's `saveAs` performs (create an object
 * URL, click a temporary anchor, then revoke the URL). Observable download
 * behavior is unchanged for the blob exports here.
 */
function saveAs(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ============================================================================
// Types (matching FrameworkReportsModule)
// ============================================================================

type ComplianceStatus = 'compliant' | 'partial' | 'gap' | 'not-applicable';
type EvidenceStatus = 'verified' | 'pending-review' | 'missing' | 'expired';

interface Evidence {
  id: string;
  name: string;
  type: string;
  source: string;
  collectedAt: string;
  status: EvidenceStatus;
}

interface ControlMapping {
  controlId: string;
  controlName: string;
  controlCategory: string;
  status: ComplianceStatus;
  evidence: Evidence[];
  lastTested: string;
  testResult: string;
  notes?: string;
}

interface Requirement {
  id: string;
  article: string;
  title: string;
  description: string;
  category: string;
  riskLevel: string;
  status: ComplianceStatus;
  controlMappings: ControlMapping[];
  gapDescription?: string;
  remediationGuidance?: string;
  dueDate?: string;
  owner?: string;
}

interface RequirementCategory {
  id: string;
  name: string;
  description: string;
  requirements: Requirement[];
}

interface Framework {
  id: string;
  code: string;
  name: string;
  fullName: string;
  description: string;
  effectiveDate: string;
  version: string;
  regulatoryBody: string;
  jurisdiction: string;
  applicability: string[];
  categories: RequirementCategory[];
  overallScore: number;
  lastAssessment: string;
  nextAssessment: string;
  certificationStatus?: string;
}

interface ExportOptions {
  sections: string[];
  includeEvidence: boolean;
  includeGaps: boolean;
  generatedBy: string;
  /**
   * Where the figures in this artifact came from. REQUIRED, deliberately: these exporters
   * title their output "Compliance Assessment Report", write a real filename to disk and
   * leave the browser, at which point no on-screen badge follows them. Making the flag
   * mandatory means a new call site cannot emit an unmarked file by omission - it has to
   * state which kind of document it is producing.
   *
   * 'illustrative' -> the artifact is marked as a sample on its cover, in a repeated page
   * footer, in its first CSV row / JSON metadata, and in its filename.
   * 'measured'     -> no marking. Only pass this when every figure in the export is
   *                   traceable to real data.
   */
  dataProvenance: 'illustrative' | 'measured';
}

/**
 * Which report sections each format actually produces.
 *
 * The Generate Report modal offered seven sections for every format. Measured against the
 * exporters below, three of them - control-inventory, trend-analysis and auditor-notes - are
 * consumed by NO exporter, so ticking them changed nothing and the reader of the resulting
 * document never learned a section they asked for was missing. Two further mismatches:
 * evidence-package is honoured by the PDF path only (exportToWord has no evidence section),
 * and exportToExcel / exportToJSON never read options.sections at all - they emit a fixed
 * payload, while the JSON echoes the requested section list into its metadata as though it
 * had been applied.
 *
 * Exported so the modal can drive itself from this map instead of a hardcoded list. Offering
 * only what a format can deliver is the honest fix; the alternative is implementing three
 * report sections nobody has specified.
 *
 * KEEP IN SYNC with the `options.sections.includes(...)` guards in the exporters. If you add
 * a section to an exporter, add it here or the modal will never offer it.
 */
export interface FormatCapability {
  /** Sections this format honours, in the order it emits them. */
  sections: string[];
  /**
   * False when the format ignores the section selection entirely and emits a fixed payload.
   * The modal disables section choice and says so rather than pretending the tick boxes matter.
   */
  honoursSections: boolean;
  /** Shown in the modal so the user knows what they will actually get. */
  note: string;
}

export const FORMAT_CAPABILITIES: Record<'pdf' | 'docx' | 'csv' | 'json', FormatCapability> = {
  pdf: {
    sections: ['executive-summary', 'requirement-status', 'gap-analysis', 'evidence-package'],
    honoursSections: true,
    note: 'Cover page, then the sections you select.',
  },
  docx: {
    // No evidence section exists in exportToWord.
    sections: ['executive-summary', 'requirement-status', 'gap-analysis'],
    honoursSections: true,
    note: 'Cover page, then the sections you select. The evidence package is PDF-only.',
  },
  csv: {
    sections: [],
    honoursSections: false,
    note: 'A fixed summary block plus one row per requirement. Section selection does not apply to CSV.',
  },
  json: {
    sections: [],
    honoursSections: false,
    note: 'The complete framework structure, including controls and evidence. Section selection does not apply to JSON.',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Filename marking. A file that lands on a shared drive is identified by its name long
 * before anyone opens it, so the marking has to be in the name too.
 */
function provenanceFileName(base: string, ext: string, provenance: ExportOptions['dataProvenance']): string {
  return provenance === 'illustrative'
    ? `SAMPLE_NOT_FOR_FILING_${base}.${ext}`
    : `${base}.${ext}`;
}

function getStatusLabel(status: ComplianceStatus): string {
  const labels: Record<ComplianceStatus, string> = {
    compliant: 'Compliant',
    partial: 'Partial',
    gap: 'Gap',
    'not-applicable': 'N/A',
  };
  return labels[status] || status;
}

function getStatusColor(status: ComplianceStatus): [number, number, number] {
  const colors: Record<ComplianceStatus, [number, number, number]> = {
    compliant: [16, 185, 129],    // emerald-500
    partial: [245, 158, 11],      // amber-500
    gap: [239, 68, 68],           // rose-500
    'not-applicable': [148, 163, 184], // slate-400
  };
  return colors[status] || [100, 100, 100];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * The compliance rate an artifact should print, derived from the requirement tallies it also
 * prints.
 *
 * `framework.overallScore` is a bare literal per framework (82 / 75 / 68 / 71 / 76). The UI
 * already derives its card badges from the tallies, but the exporters printed the literal —
 * so a downloaded document contradicted its own arithmetic. Measured on the EU AI Act CSV:
 * row 15 read "Overall Score, 68%" while rows 16-17 read "Total Requirements, 5" and
 * "Compliant, 2", i.e. 40%, and the on-screen card read 40%. Four of the five frameworks
 * disagreed (NIST 75 vs 67, EU 68 vs 40, ISO 71 vs 67, CRI 76 vs 72).
 *
 * Derived here so a cover page and an executive summary in the same file cannot diverge.
 */
function derivedScore(framework: Framework): number {
  const stats = calculateStats(framework);
  return stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0;
}

function calculateStats(framework: Framework) {
  let total = 0, compliant = 0, partial = 0, gaps = 0, na = 0;
  let totalControls = 0, totalEvidence = 0;

  framework.categories.forEach(cat => {
    cat.requirements.forEach(req => {
      total++;
      if (req.status === 'compliant') compliant++;
      else if (req.status === 'partial') partial++;
      else if (req.status === 'gap') gaps++;
      else na++;

      req.controlMappings.forEach(ctrl => {
        totalControls++;
        totalEvidence += ctrl.evidence.length;
      });
    });
  });

  return { total, compliant, partial, gaps, na, totalControls, totalEvidence };
}

// ============================================================================
// PDF Export
// ============================================================================

export async function exportToPDF(
  framework: Framework,
  options: ExportOptions
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const stats = calculateStats(framework);
  let yPos = margin;

  // Helper to add new page if needed
  const checkPageBreak = (requiredHeight: number) => {
    if (yPos + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      addHeader();
    }
  };

  // Add header to each page
  const addHeader = () => {
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`${framework.code} Compliance Report`, margin, 10);
    doc.text(`Generated: ${formatDate(new Date().toISOString())}`, pageWidth - margin, 10, { align: 'right' });
  };

  // Add footer with page numbers
  const addFooter = () => {
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Page ${i} of ${pageCount}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      // The sample mark replaces "Confidential" rather than sitting beside it: a reader
      // skimming footers must not see only a confidentiality marker on an illustrative doc.
      doc.text(
        options.dataProvenance === 'illustrative' ? SAMPLE_FOOTER_MARK : 'Confidential',
        margin,
        pageHeight - 10,
      );
      doc.text('AVA Platform', pageWidth - margin, pageHeight - 10, { align: 'right' });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Cover Page
  // ─────────────────────────────────────────────────────────────────────────

  // Title block
  doc.setFillColor(30, 41, 59); // slate-800
  doc.rect(0, 0, pageWidth, 80, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.setFont('helvetica', 'bold');
  doc.text(framework.code, margin, 35);

  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(
    options.dataProvenance === 'illustrative'
      ? 'Compliance Assessment Report (SAMPLE)'
      : 'Compliance Assessment Report',
    margin,
    48,
  );

  doc.setFontSize(10);
  doc.text(framework.fullName, margin, 62);

  // Score circle
  const scoreX = pageWidth - 50;
  const scoreY = 45;
  const score = derivedScore(framework);
  const scoreColor = score >= 80 ? [16, 185, 129] :
                     score >= 60 ? [245, 158, 11] : [239, 68, 68];
  doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2]);
  doc.circle(scoreX, scoreY, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(`${score}%`, scoreX, scoreY + 6, { align: 'center' });

  yPos = 100;

  // Provenance banner, above the metadata and therefore above every figure in the document.
  if (options.dataProvenance === 'illustrative') {
    doc.setFillColor(254, 242, 242);
    doc.setDrawColor(239, 68, 68);
    const lines = sampleBannerLines(`${framework.code} compliance assessment report`);
    const bannerHeight = 14 + lines.length * 5;
    doc.rect(margin, yPos, pageWidth - margin * 2, bannerHeight, 'FD');
    doc.setTextColor(153, 27, 27);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(SAMPLE_TITLE, margin + 4, yPos + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    lines.forEach((line, i) => {
      doc.text(line, margin + 4, yPos + 13 + i * 5);
    });
    yPos += bannerHeight + 8;
    doc.setTextColor(30, 41, 59);
  }

  // Report metadata
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  const metadata = [
    ['Regulatory Body:', framework.regulatoryBody],
    ['Jurisdiction:', framework.jurisdiction],
    ['Framework Version:', framework.version],
    ['Effective Date:', formatDate(framework.effectiveDate)],
    ['Assessment Date:', formatDate(framework.lastAssessment)],
    ['Next Assessment:', formatDate(framework.nextAssessment)],
    ['Generated By:', options.generatedBy],
    ['Report Date:', formatDate(new Date().toISOString())],
  ];

  metadata.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + 50, yPos);
    yPos += 8;
  });

  yPos += 10;

  // Applicability
  doc.setFont('helvetica', 'bold');
  doc.text('Applicability:', margin, yPos);
  yPos += 8;
  doc.setFont('helvetica', 'normal');
  framework.applicability.forEach(app => {
    doc.text(`• ${app}`, margin + 5, yPos);
    yPos += 6;
  });

  yPos += 15;

  // Summary stats box
  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 50, 3, 3, 'F');

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Assessment Summary', margin + 10, yPos + 12);

  const summaryX = margin + 10;
  const summaryY = yPos + 25;
  const colWidth = (pageWidth - 2 * margin - 20) / 4;

  const summaryItems = [
    { label: 'Total Requirements', value: stats.total.toString(), color: [30, 41, 59] },
    { label: 'Compliant', value: stats.compliant.toString(), color: [16, 185, 129] },
    { label: 'Partial', value: stats.partial.toString(), color: [245, 158, 11] },
    { label: 'Gaps', value: stats.gaps.toString(), color: [239, 68, 68] },
  ];

  summaryItems.forEach((item, i) => {
    const x = summaryX + i * colWidth;
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(item.value, x, summaryY);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, x, summaryY + 10);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Executive Summary (if selected)
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('executive-summary')) {
    doc.addPage();
    yPos = margin;
    addHeader();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Executive Summary', margin, yPos);
    yPos += 15;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);

    const summaryText = `This report presents the compliance assessment results for ${framework.fullName}. ` +
      `The assessment evaluated ${stats.total} requirements across ${framework.categories.length} categories, ` +
      `with ${stats.totalControls} controls mapped and ${stats.totalEvidence} pieces of evidence collected.\n\n` +
      `Overall compliance score: ${score}%\n\n` +
      `Key findings:\n` +
      `• ${stats.compliant} requirements are fully compliant (${Math.round(stats.compliant / stats.total * 100)}%)\n` +
      `• ${stats.partial} requirements have partial compliance requiring attention\n` +
      `• ${stats.gaps} requirements have identified gaps requiring remediation\n\n` +
      (stats.gaps > 0 ? `Immediate action is required to address the ${stats.gaps} identified gap(s) before the next assessment scheduled for ${formatDate(framework.nextAssessment)}.` : 'No critical gaps were identified in this assessment.');

    const lines = doc.splitTextToSize(summaryText, pageWidth - 2 * margin);
    doc.text(lines, margin, yPos);
    yPos += lines.length * 5 + 15;

    // Compliance by category chart (as table)
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Compliance by Category', margin, yPos);
    yPos += 8;

    const categoryData = framework.categories.map(cat => {
      const catCompliant = cat.requirements.filter(r => r.status === 'compliant').length;
      const catTotal = cat.requirements.length;
      const pct = Math.round(catCompliant / catTotal * 100);
      return [cat.name, catTotal.toString(), catCompliant.toString(), `${pct}%`];
    });

    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Requirements', 'Compliant', 'Score']],
      body: categoryData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: margin, right: margin },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement Status (if selected)
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('requirement-status')) {
    framework.categories.forEach(category => {
      doc.addPage();
      yPos = margin;
      addHeader();

      // Category header
      doc.setFillColor(241, 245, 249); // slate-100
      doc.roundedRect(margin, yPos, pageWidth - 2 * margin, 20, 2, 2, 'F');
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30, 41, 59);
      doc.text(category.name, margin + 5, yPos + 13);
      yPos += 28;

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      const descLines = doc.splitTextToSize(category.description, pageWidth - 2 * margin);
      doc.text(descLines, margin, yPos);
      yPos += descLines.length * 4 + 10;

      // Requirements table
      const reqData = category.requirements.map(req => [
        req.article,
        req.title,
        req.riskLevel.toUpperCase(),
        getStatusLabel(req.status),
        req.owner || '-',
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Article', 'Requirement', 'Risk', 'Status', 'Owner']],
        body: reqData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
        styles: { fontSize: 8, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: 70 },
          2: { cellWidth: 20 },
          3: { cellWidth: 25 },
          4: { cellWidth: 35 },
        },
        margin: { left: margin, right: margin },
        didParseCell: (data) => {
          if (data.column.index === 3 && data.section === 'body') {
            const status = category.requirements[data.row.index]?.status;
            if (status) {
              const color = getStatusColor(status);
              data.cell.styles.textColor = color;
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;

      // Detailed requirement breakdown
      category.requirements.forEach(req => {
        checkPageBreak(60);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`${req.article} - ${req.title}`, margin, yPos);
        yPos += 6;

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        const reqDescLines = doc.splitTextToSize(req.description, pageWidth - 2 * margin);
        doc.text(reqDescLines, margin, yPos);
        yPos += reqDescLines.length * 4 + 5;

        // Controls table
        if (req.controlMappings.length > 0) {
          const ctrlData = req.controlMappings.map(ctrl => [
            ctrl.controlId,
            ctrl.controlName,
            ctrl.controlCategory,
            getStatusLabel(ctrl.status),
            ctrl.evidence.length.toString(),
          ]);

          autoTable(doc, {
            startY: yPos,
            head: [['Control ID', 'Control Name', 'Type', 'Status', 'Evidence']],
            body: ctrlData,
            theme: 'grid',
            headStyles: { fillColor: [100, 116, 139], textColor: 255, fontSize: 7 },
            styles: { fontSize: 7, cellPadding: 2 },
            margin: { left: margin + 5, right: margin + 5 },
          });

          yPos = (doc as any).lastAutoTable.finalY + 10;
        }
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gap Analysis (if selected)
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('gap-analysis') && options.includeGaps) {
    doc.addPage();
    yPos = margin;
    addHeader();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Gap Analysis', margin, yPos);
    yPos += 15;

    const gapRequirements = framework.categories.flatMap(cat =>
      cat.requirements.filter(req => req.status === 'gap' || req.status === 'partial')
    );

    if (gapRequirements.length === 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(16, 185, 129);
      doc.text('No gaps identified in this assessment.', margin, yPos);
    } else {
      gapRequirements.forEach((req, index) => {
        checkPageBreak(50);

        // Gap header
        const statusColor = getStatusColor(req.status);
        doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
        doc.rect(margin, yPos, 3, 30, 'F');

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 41, 59);
        doc.text(`${index + 1}. ${req.article} - ${req.title}`, margin + 8, yPos + 6);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Risk Level: ${req.riskLevel.toUpperCase()} | Owner: ${req.owner || 'Unassigned'} | Due: ${req.dueDate || 'TBD'}`, margin + 8, yPos + 14);

        if (req.gapDescription) {
          doc.setTextColor(71, 85, 105);
          const gapLines = doc.splitTextToSize(`Gap: ${req.gapDescription}`, pageWidth - 2 * margin - 15);
          doc.text(gapLines, margin + 8, yPos + 22);
          yPos += 22 + gapLines.length * 4;
        } else {
          yPos += 22;
        }

        if (req.remediationGuidance) {
          doc.setTextColor(30, 64, 175); // blue-800
          const remLines = doc.splitTextToSize(`Remediation: ${req.remediationGuidance}`, pageWidth - 2 * margin - 15);
          doc.text(remLines, margin + 8, yPos);
          yPos += remLines.length * 4 + 10;
        } else {
          yPos += 10;
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Evidence Package (if selected)
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('evidence-package') && options.includeEvidence) {
    doc.addPage();
    yPos = margin;
    addHeader();

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Evidence Inventory', margin, yPos);
    yPos += 15;

    const allEvidence: { req: string; control: string; evidence: Evidence }[] = [];
    framework.categories.forEach(cat => {
      cat.requirements.forEach(req => {
        req.controlMappings.forEach(ctrl => {
          ctrl.evidence.forEach(ev => {
            allEvidence.push({ req: req.article, control: ctrl.controlId, evidence: ev });
          });
        });
      });
    });

    const evidenceData = allEvidence.map(e => [
      e.req,
      e.control,
      e.evidence.name,
      e.evidence.type,
      e.evidence.source,
      e.evidence.status,
      e.evidence.collectedAt,
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Req', 'Control', 'Evidence Name', 'Type', 'Source', 'Status', 'Collected']],
      body: evidenceData,
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7 },
      styles: { fontSize: 6, cellPadding: 2 },
      margin: { left: margin, right: margin },
    });
  }

  // Add footers to all pages
  addFooter();

  // Save the PDF
  const fileName = provenanceFileName(
    `${framework.code.replace(/\s+/g, '-')}-Compliance-Report-${new Date().toISOString().slice(0, 10)}`,
    'pdf',
    options.dataProvenance,
  );
  doc.save(fileName);
}

// ============================================================================
// Word Export
// ============================================================================

export async function exportToWord(
  framework: Framework,
  options: ExportOptions
): Promise<void> {
  const stats = calculateStats(framework);

  const children: (Paragraph | Table)[] = [];

  // Helper for status colors in Word
  const getStatusColorHex = (status: ComplianceStatus): string => {
    const colors: Record<ComplianceStatus, string> = {
      compliant: '10B981',
      partial: 'F59E0B',
      gap: 'EF4444',
      'not-applicable': '94A3B8',
    };
    return colors[status] || '64748B';
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Cover Page
  // ─────────────────────────────────────────────────────────────────────────

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: framework.code,
          bold: true,
          size: 56,
          color: '1E293B',
        }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: options.dataProvenance === 'illustrative'
            ? 'Compliance Assessment Report (SAMPLE)'
            : 'Compliance Assessment Report',
          size: 32,
          color: '475569',
        }),
      ],
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: framework.fullName,
          size: 24,
          color: '64748B',
        }),
      ],
      spacing: { after: 600 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Overall Compliance Score: ${derivedScore(framework)}%`,
          bold: true,
          size: 36,
          color: derivedScore(framework) >= 80 ? '10B981' : derivedScore(framework) >= 60 ? 'F59E0B' : 'EF4444',
        }),
      ],
      spacing: { after: 600 },
    })
  );

  // Metadata table
  const metadataRows = [
    ['Regulatory Body', framework.regulatoryBody],
    ['Jurisdiction', framework.jurisdiction],
    ['Framework Version', framework.version],
    ['Effective Date', formatDate(framework.effectiveDate)],
    ['Assessment Date', formatDate(framework.lastAssessment)],
    ['Next Assessment', formatDate(framework.nextAssessment)],
    ['Generated By', options.generatedBy],
    ['Report Date', formatDate(new Date().toISOString())],
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metadataRows.map(([label, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                children: [new TextRun({ text: label, bold: true, size: 22 })],
              })],
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR },
            }),
            new TableCell({
              width: { size: 70, type: WidthType.PERCENTAGE },
              children: [new Paragraph({
                children: [new TextRun({ text: value, size: 22 })],
              })],
            }),
          ],
        })
      ),
    })
  );

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ─────────────────────────────────────────────────────────────────────────
  // Executive Summary
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('executive-summary')) {
    children.push(
      new Paragraph({
        text: 'Executive Summary',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `This report presents the compliance assessment results for ${framework.fullName}. ` +
              `The assessment evaluated ${stats.total} requirements across ${framework.categories.length} categories, ` +
              `with ${stats.totalControls} controls mapped and ${stats.totalEvidence} pieces of evidence collected.`,
            size: 22,
          }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: 'Assessment Summary',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 200 },
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Metric', bold: true })] })],
                shading: { fill: '1E293B', type: ShadingType.CLEAR },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Count', bold: true, color: 'FFFFFF' })] })],
                shading: { fill: '1E293B', type: ShadingType.CLEAR },
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: 'Percentage', bold: true, color: 'FFFFFF' })] })],
                shading: { fill: '1E293B', type: ShadingType.CLEAR },
              }),
            ],
          }),
          ...([
            ['Total Requirements', stats.total, '100%'],
            ['Compliant', stats.compliant, `${Math.round(stats.compliant / stats.total * 100)}%`],
            ['Partial', stats.partial, `${Math.round(stats.partial / stats.total * 100)}%`],
            ['Gaps', stats.gaps, `${Math.round(stats.gaps / stats.total * 100)}%`],
            ['Not Applicable', stats.na, `${Math.round(stats.na / stats.total * 100)}%`],
          ].map(([label, count, pct]) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: label as string })] }),
                new TableCell({ children: [new Paragraph({ text: count.toString() })] }),
                new TableCell({ children: [new Paragraph({ text: pct as string })] }),
              ],
            })
          )),
        ],
      }),
      new Paragraph({ children: [new PageBreak()] })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Requirement Status by Category
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('requirement-status')) {
    framework.categories.forEach(category => {
      children.push(
        new Paragraph({
          text: category.name,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: category.description, size: 22, color: '64748B' })],
          spacing: { after: 300 },
        })
      );

      // Requirements table
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: ['Article', 'Requirement', 'Risk', 'Status', 'Owner'].map(header =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: header, bold: true, color: 'FFFFFF', size: 20 })] })],
                  shading: { fill: '1E293B', type: ShadingType.CLEAR },
                })
              ),
            }),
            ...category.requirements.map(req =>
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph({ text: req.article })] }),
                  new TableCell({ children: [new Paragraph({ text: req.title })] }),
                  new TableCell({ children: [new Paragraph({ text: req.riskLevel.toUpperCase() })] }),
                  new TableCell({
                    children: [new Paragraph({
                      children: [new TextRun({
                        text: getStatusLabel(req.status),
                        bold: true,
                        color: getStatusColorHex(req.status),
                      })],
                    })],
                  }),
                  new TableCell({ children: [new Paragraph({ text: req.owner || '-' })] }),
                ],
              })
            ),
          ],
        })
      );

      // Detailed requirements
      category.requirements.forEach(req => {
        children.push(
          new Paragraph({
            text: `${req.article} - ${req.title}`,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [new TextRun({ text: req.description, size: 20, color: '475569' })],
            spacing: { after: 200 },
          })
        );

        if (req.controlMappings.length > 0) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: 'Mapped Controls:', bold: true, size: 20 })],
              spacing: { after: 100 },
            }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: ['Control ID', 'Name', 'Type', 'Status', 'Evidence'].map(h =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18 })] })],
                      shading: { fill: 'E2E8F0', type: ShadingType.CLEAR },
                    })
                  ),
                }),
                ...req.controlMappings.map(ctrl =>
                  new TableRow({
                    children: [
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ctrl.controlId, size: 18 })] })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ctrl.controlName, size: 18 })] })] }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ctrl.controlCategory, size: 18 })] })] }),
                      new TableCell({
                        children: [new Paragraph({
                          children: [new TextRun({ text: getStatusLabel(ctrl.status), size: 18, color: getStatusColorHex(ctrl.status) })],
                        })],
                      }),
                      new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: ctrl.evidence.length.toString(), size: 18 })] })] }),
                    ],
                  })
                ),
              ],
            })
          );
        }
      });

      children.push(new Paragraph({ children: [new PageBreak()] }));
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Gap Analysis
  // ─────────────────────────────────────────────────────────────────────────

  if (options.sections.includes('gap-analysis') && options.includeGaps) {
    children.push(
      new Paragraph({
        text: 'Gap Analysis',
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 300 },
      })
    );

    const gapRequirements = framework.categories.flatMap(cat =>
      cat.requirements.filter(req => req.status === 'gap' || req.status === 'partial')
    );

    if (gapRequirements.length === 0) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'No gaps identified in this assessment.', color: '10B981', size: 24 })],
        })
      );
    } else {
      gapRequirements.forEach((req, index) => {
        children.push(
          new Paragraph({
            text: `${index + 1}. ${req.article} - ${req.title}`,
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 300, after: 100 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Risk Level: ', bold: true, size: 20 }),
              new TextRun({ text: `${req.riskLevel.toUpperCase()} | `, size: 20 }),
              new TextRun({ text: 'Owner: ', bold: true, size: 20 }),
              new TextRun({ text: `${req.owner || 'Unassigned'} | `, size: 20 }),
              new TextRun({ text: 'Due: ', bold: true, size: 20 }),
              new TextRun({ text: req.dueDate || 'TBD', size: 20 }),
            ],
            spacing: { after: 100 },
          })
        );

        if (req.gapDescription) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Gap Description: ', bold: true, size: 20 }),
                new TextRun({ text: req.gapDescription, size: 20 }),
              ],
              spacing: { after: 100 },
            })
          );
        }

        if (req.remediationGuidance) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: 'Remediation Guidance: ', bold: true, size: 20, color: '1E40AF' }),
                new TextRun({ text: req.remediationGuidance, size: 20, color: '1E40AF' }),
              ],
              spacing: { after: 200 },
            })
          );
        }
      });
    }
  }

  // Create document
  const doc = new Document({
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${framework.code} Compliance Report`, size: 18, color: '94A3B8' }),
              ],
              alignment: AlignmentType.LEFT,
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: options.dataProvenance === 'illustrative'
                    ? `${SAMPLE_FOOTER_MARK} | AVA Platform | Page `
                    : 'Confidential | AVA Platform | Page ',
                  size: 18,
                  color: options.dataProvenance === 'illustrative' ? 'B91C1C' : '94A3B8',
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 18,
                  color: '94A3B8',
                }),
                new TextRun({ text: ' of ', size: 18, color: '94A3B8' }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  size: 18,
                  color: '94A3B8',
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        }),
      },
      children,
    }],
  });

  // Generate and save
  const blob = await Packer.toBlob(doc);
  const fileName = provenanceFileName(
    `${framework.code.replace(/\s+/g, '-')}-Compliance-Report-${new Date().toISOString().slice(0, 10)}`,
    'docx',
    options.dataProvenance,
  );
  saveAs(blob, fileName);
}

// ============================================================================
// Excel Export
// ============================================================================

export async function exportToExcel(
  framework: Framework,
  options: ExportOptions
): Promise<void> {
  // For Excel, we'll create a CSV that Excel can open with proper formatting
  const rows: string[][] = [];

  // Provenance FIRST - row 1 of the file, so it is visible before any figure and survives
  // being opened in a spreadsheet that shows only the first screenful.
  if (options.dataProvenance === 'illustrative') {
    rows.push([SAMPLE_TITLE]);
    sampleBannerLines(`${framework.code} compliance assessment report`).forEach(line => {
      rows.push([line.trim()]);
    });
    rows.push([]);
  }

  // Header
  rows.push([
    options.dataProvenance === 'illustrative'
      ? `${framework.code} Compliance Report (SAMPLE)`
      : `${framework.code} Compliance Report`,
  ]);
  rows.push([`Generated: ${formatDate(new Date().toISOString())}`]);
  rows.push([`Generated By: ${options.generatedBy}`]);
  rows.push([]);

  // Summary
  const stats = calculateStats(framework);
  rows.push(['Summary']);
  rows.push(['Overall Score', `${derivedScore(framework)}%`]);
  rows.push(['Total Requirements', stats.total.toString()]);
  rows.push(['Compliant', stats.compliant.toString()]);
  rows.push(['Partial', stats.partial.toString()]);
  rows.push(['Gaps', stats.gaps.toString()]);
  rows.push([]);

  // Detailed requirements
  rows.push(['Category', 'Article', 'Requirement', 'Description', 'Risk Level', 'Status', 'Owner', 'Due Date', 'Gap Description', 'Remediation']);

  framework.categories.forEach(cat => {
    cat.requirements.forEach(req => {
      rows.push([
        cat.name,
        req.article,
        req.title,
        req.description,
        req.riskLevel,
        getStatusLabel(req.status),
        req.owner || '',
        req.dueDate || '',
        req.gapDescription || '',
        req.remediationGuidance || '',
      ]);
    });
  });

  // Convert to CSV
  const csv = rows.map(row =>
    row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const fileName = provenanceFileName(
    `${framework.code.replace(/\s+/g, '-')}-Compliance-Report-${new Date().toISOString().slice(0, 10)}`,
    'csv',
    options.dataProvenance,
  );
  saveAs(blob, fileName);
}

// ============================================================================
// JSON Export (structured)
// ============================================================================

export function exportToJSON(
  framework: Framework,
  options: ExportOptions
): void {
  const stats = calculateStats(framework);

  const exportData = {
    // Provenance keys FIRST. A JSON artifact is the shape another system would ingest as
    // input, so the marking is a field a consumer can branch on, not just prose.
    ...(options.dataProvenance === 'illustrative'
      ? {
          _WARNING: SAMPLE_TITLE,
          _isSampleData: true,
          _description: sampleBannerLines(`${framework.code} compliance assessment report`).join(' ').replace(/\s+/g, ' ').trim(),
        }
      : {}),
    metadata: {
      dataProvenance: options.dataProvenance,
      frameworkCode: framework.code,
      frameworkName: framework.fullName,
      version: framework.version,
      regulatoryBody: framework.regulatoryBody,
      jurisdiction: framework.jurisdiction,
      generatedAt: new Date().toISOString(),
      generatedBy: options.generatedBy,
      sections: options.sections,
    },
    summary: {
      // Derived from the tallies in this same payload, not the stored literal.
      overallScore: derivedScore(framework),
      ...stats,
      lastAssessment: framework.lastAssessment,
      nextAssessment: framework.nextAssessment,
      certificationStatus: framework.certificationStatus,
    },
    categories: framework.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description,
      requirements: cat.requirements.map(req => ({
        id: req.id,
        article: req.article,
        title: req.title,
        description: req.description,
        riskLevel: req.riskLevel,
        status: req.status,
        owner: req.owner,
        dueDate: req.dueDate,
        gapDescription: req.gapDescription,
        remediationGuidance: req.remediationGuidance,
        controls: req.controlMappings.map(ctrl => ({
          controlId: ctrl.controlId,
          controlName: ctrl.controlName,
          category: ctrl.controlCategory,
          status: ctrl.status,
          lastTested: ctrl.lastTested,
          testResult: ctrl.testResult,
          notes: ctrl.notes,
          evidenceCount: ctrl.evidence.length,
          evidence: options.includeEvidence ? ctrl.evidence : undefined,
        })),
      })),
    })),
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const fileName = provenanceFileName(
    `${framework.code.replace(/\s+/g, '-')}-Compliance-Report-${new Date().toISOString().slice(0, 10)}`,
    'json',
    options.dataProvenance,
  );
  saveAs(blob, fileName);
}
