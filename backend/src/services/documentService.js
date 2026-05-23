'use strict';

const path   = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');
const { PDFDocument } = require('pdf-lib');
const puppeteer = require('puppeteer');

const { save, read }            = require('./storageService');
const { insertAttachment, getAttachment } = require('../db/queries/attachments');
const { insertSesDocument }     = require('../db/queries/sesDocuments');
const { getFormAttachments }    = require('../db/queries/formAttachments');
const { getSesForm, getLatestFormVersion } = require('../db/queries/ses');
const pool = require('../db/pool');

const TEMPLATE_PATH = path.join(__dirname, '../../templates/ses_template.xlsx');

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

function safeName(str) {
  return (String(str || ''))
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    || 'unknown';
}

function extractFormData(fields, formIndex = 0) {
  if (fields.forms?.length) {
    const form = fields.forms[formIndex] || fields.forms[0];
    const { sesRows, removedAttachments, attOrder, ...vals } = form;
    return { ...vals, sesRows: sesRows || [] };
  }
  return { ...fields, sesRows: fields.sesRows || [] };
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return isNaN(dt.getTime())
    ? String(d)
    : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtNum(n) {
  const v = parseFloat(n);
  return isNaN(v) ? '' : v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL FIELD MAP — which template cell each form field goes into
// ─────────────────────────────────────────────────────────────────────────────

const EXCEL_FIELD_MAP = {
  vendorName:         'F13',
  supplierNumber:     'F15',
  contractNumber:     'F17',
  poNumber:           'F19',
  invoiceNumber:      'F24',
  invoiceAmount:      'F26',
  currency:           'F28',
  licence:            'C33',
  description:        'C35',
  wbsElement:         'C38',
  contractHolderName: 'E49',
  ceName:             'E51',
  enteredBy:          'E60',
};

// ─────────────────────────────────────────────────────────────────────────────
// POPULATE TEMPLATE — load XLSX, write form data, return workbook + sheet
// Amounts are per-SES (sesRows[i].amount → H38/H40/H42).
// If 4+ SES entries the amount boxes are left blank.
// ─────────────────────────────────────────────────────────────────────────────

async function populateTemplate(formId, formIndex) {
  const form = await getSesForm(formId);
  if (!form) throw Object.assign(new Error('SES form not found'), { status: 404 });

  const version  = await getLatestFormVersion(formId);
  const data     = extractFormData(version?.data || {}, formIndex);
  const sesRows  = data.sesRows || [];

  const { rows: wfRows } = await pool.query(
    'SELECT * FROM workflows WHERE id = $1', [form.workflowId]
  );
  const workflow = wfRows[0];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.worksheets[0];

  // Write scalar form fields
  for (const [field, addr] of Object.entries(EXCEL_FIELD_MAP)) {
    const val = data[field];
    if (val !== undefined && val !== null && val !== '') {
      sheet.getCell(addr).value = String(val);
    }
  }

  // Dates — write as formatted strings so HTML renderer gets plain text
  sheet.getCell('H5').value = fmtDate(data.invoiceDate);
  sheet.getCell('H7').value = workflow?.created_at ? fmtDate(workflow.created_at) : '';

  // SES numbers → single comma-separated string
  const sesNums = sesRows.map((r) => r.sesNumber).filter(Boolean).join(', ');
  sheet.getCell('H9').value = sesNums;

  // Amounts: per-SES, max 3 filled; 4+ SES → all blank
  const amts = [0, 0, 0];
  if (sesRows.length >= 1 && sesRows.length <= 3) {
    sesRows.forEach((r, i) => { amts[i] = parseFloat(r.amount) || 0; });
  }
  const showAmts = sesRows.length >= 1 && sesRows.length <= 3;

  // Override formula cells with computed values
  sheet.getCell('H38').value = showAmts && amts[0] ? fmtNum(amts[0]) : '';
  sheet.getCell('H40').value = showAmts && amts[1] ? fmtNum(amts[1]) : '';
  sheet.getCell('H42').value = showAmts && amts[2] ? fmtNum(amts[2]) : '';
  sheet.getCell('H44').value = showAmts
    ? fmtNum(amts.reduce((a, b) => a + b, 0))
    : '';

  return { workbook, sheet, data, workflow, form };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL → HTML RENDERER
// Reads the populated sheet cell-by-cell and reproduces its layout as an HTML
// table with inline styles, faithfully matching column widths, row heights,
// borders, fonts, and merged regions.
// ─────────────────────────────────────────────────────────────────────────────

function decodeRef(ref) {
  const m = String(ref || '').match(/^([A-Z]+)(\d+)$/i);
  if (!m) return null;
  let c = 0;
  for (const ch of m[1].toUpperCase()) c = c * 26 + ch.charCodeAt(0) - 64;
  return { r: parseInt(m[2], 10), c };
}

function argbToCss(argb) {
  if (!argb || typeof argb !== 'string') return null;
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  return /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex}` : null;
}

function borderCss(b) {
  if (!b || !b.style || b.style === 'none') return 'none';
  const color = (b.color && b.color.argb) ? (argbToCss(b.color.argb) || '#000') : '#000';
  const w = { hair: '1px', thin: '1px', medium: '2px', thick: '3px' }[b.style] || '1px';
  return b.style === 'double' ? `3px double ${color}` : `${w} solid ${color}`;
}

function resolveCell(cell) {
  let val = cell.value;
  if (val !== null && val !== undefined && typeof val === 'object') {
    if ('formula' in val)         val = val.result ?? '';
    else if (val.richText)        val = val.richText.map((rt) => rt.text).join('');
    else if (val.text)            val = val.text;
    else if (val instanceof Date) val = fmtDate(val);
    else                          val = '';
  }
  if (val instanceof Date) val = fmtDate(val);
  return val === null || val === undefined ? '' : String(val);
}

function borderStyle(b) {
  return b && b.style && b.style !== 'none' ? b.style : null;
}

// Determine whether a content cell should absorb an adjacent empty cell.
// Rules:
//  1. Never absorb if the empty cell has a left border (it starts a new box).
//  2. If content cell has NO borders: only absorb cells that also have no borders
//     (label cells expanding into blank space).
//  3. If content cell HAS borders: only absorb cells whose bottom border style
//     matches (so underline fields extend to their natural width, but stop at
//     spacer columns that have no border).
function canAbsorb(contentEntry, emptyEntry) {
  const cb = contentEntry.cell.border || {};
  const eb = emptyEntry.cell.border   || {};

  // Rule 1: left border on target cell = new box region, don't cross it
  if (borderStyle(eb.left)) return false;

  const cHas = !!(borderStyle(cb.top) || borderStyle(cb.bottom) || borderStyle(cb.left) || borderStyle(cb.right));
  const eHas = !!(borderStyle(eb.top) || borderStyle(eb.bottom) || borderStyle(eb.left) || borderStyle(eb.right));

  // Rule 2: borderless label expanding into borderless space
  if (!cHas && !eHas) return true;

  // Mismatch: one bordered, other not → stop
  if (cHas !== eHas) return false;

  // Rule 3: both have borders — absorb only if bottom-border style matches
  return (borderStyle(cb.bottom) || null) === (borderStyle(eb.bottom) || null);
}

function sheetToHtml(sheet, logoDataUrl, { maxRow = 67, maxCol = 10, zoom = 0.62 } = {}) {
  // ── Build merge lookup ──────────────────────────────────────────────────
  // skipSet  → "r,c" keys of non-master merged cells (don't render)
  // masterMap → "r,c" → { colspan, rowspan } for master merged cells
  const skipSet   = new Set();
  const masterMap = new Map();

  if (sheet.model && sheet.model.merges) {
    for (const mStr of sheet.model.merges) {
      const [s, e] = mStr.split(':');
      const st = decodeRef(s);
      const en = decodeRef(e);
      if (!st || !en || st.c > maxCol) continue;

      const effEndC = Math.min(en.c, maxCol);
      const colspan = effEndC - st.c + 1;
      const rowspan = en.r - st.r + 1;

      masterMap.set(`${st.r},${st.c}`, { colspan, rowspan });
      for (let r = st.r; r <= en.r; r++) {
        for (let c = st.c; c <= en.c; c++) {
          if (r === st.r && c === st.c) continue;
          if (c <= maxCol) skipSet.add(`${r},${c}`);
        }
      }
    }
  }

  // ── Column widths → % ──────────────────────────────────────────────────
  const DEFAULT_W = 8.43;
  const colW = [];
  let totalW = 0;
  for (let c = 1; c <= maxCol; c++) {
    const w = sheet.getColumn(c).width || DEFAULT_W;
    colW.push(w);
    totalW += w;
  }
  const pct = (w) => ((w / totalW) * 100).toFixed(2) + '%';
  const colgroup = '<colgroup>' +
    colW.map((w) => `<col style="width:${pct(w)}">`)
        .join('') +
    '</colgroup>';

  // ── Logo position ───────────────────────────────────────────────────────
  // Logo image is embedded in the XLSX; it visually spans cols A-D, rows 1-8
  const logoWidthPct = colW.slice(0, 4).reduce((a, b) => a + b, 0) / totalW * 100;
  let logoHeightPx = 0;
  for (let r = 1; r <= 8; r++) logoHeightPx += (sheet.getRow(r).height || 15) * 1.333;
  logoHeightPx = Math.round(logoHeightPx);

  // ── Build table rows ────────────────────────────────────────────────────
  let rowsHtml = '';

  for (let r = 1; r <= maxRow; r++) {
    const row = sheet.getRow(r);
    const hPx = Math.round((row.height || 15) * 1.333);

    // ── Step 1: collect visible cells for this row ──────────────────────
    const cells = [];
    let c = 1;
    while (c <= maxCol) {
      if (skipSet.has(`${r},${c}`)) { c++; continue; }

      const mi      = masterMap.get(`${r},${c}`);
      const colspan = mi ? mi.colspan : 1;
      const rowspan = mi ? mi.rowspan : 1;
      const cell    = row.getCell(c);
      const val     = resolveCell(cell);

      cells.push({ c, colspan, rowspan, val, cell, isMerged: !!mi, rightBorderOverride: null });
      c += colspan;
    }

    // ── Step 2: rightward absorption ────────────────────────────────────
    // Each non-merged content cell absorbs following empty non-merged cells
    // subject to canAbsorb(). Tracks the right border of the last absorbed
    // cell so boxed regions (e.g. amount cells H-I-J) stay visually closed.
    for (let i = 0; i < cells.length; i++) {
      const rc = cells[i];
      if (rc.isMerged || rc.val === '') continue;

      let j = i + 1;
      while (j < cells.length && !cells[j].isMerged && cells[j].val === '') {
        if (!canAbsorb(rc, cells[j])) break;
        // Track right border from the absorbed cell
        const eb = cells[j].cell.border || {};
        if (borderStyle(eb.right)) rc.rightBorderOverride = eb.right;
        rc.colspan += cells[j].colspan;
        cells.splice(j, 1); // remove absorbed cell; j stays at same index
      }
    }

    // ── Step 3: leftward absorption for right-aligned leading labels ─────
    // Rows like 5/7/9 have the label in column G (right-aligned) with A-F
    // blank. We absorb those leading blank cells into the label cell so it
    // right-aligns correctly against its value box.
    {
      let firstContent = -1;
      for (let i = 0; i < cells.length; i++) {
        if (!cells[i].isMerged && cells[i].val !== '') { firstContent = i; break; }
      }
      if (firstContent > 0 && !cells[firstContent].isMerged) {
        const al = cells[firstContent].cell.alignment || {};
        if (al.horizontal === 'right') {
          let extraColspan = 0;
          for (let k = 0; k < firstContent; k++) extraColspan += cells[k].colspan;
          cells[firstContent].colspan += extraColspan;
          cells.splice(0, firstContent);
        }
      }
    }

    // ── Step 3.5: close open right borders at the table right edge ─────
    // When column L (the decorative border bar) is excluded, cells like date
    // boxes at column J have left+top+bottom borders but no right border.
    // Detect the rightmost cell in the row and close it if it has side borders
    // but is missing a right border.
    if (cells.length > 0) {
      const last = cells[cells.length - 1];
      const lb = last.cell.border || {};
      const effectiveRight = last.rightBorderOverride || lb.right;
      if (!borderStyle(effectiveRight)) {
        const sideStyle = borderStyle(lb.left) || borderStyle(lb.top) || borderStyle(lb.bottom);
        if (sideStyle) {
          const sideColor = lb.left?.color || lb.top?.color || lb.bottom?.color || { argb: 'FF000000' };
          last.rightBorderOverride = { style: sideStyle, color: sideColor };
        }
      }
    }

    // ── Step 4: render cells ───────────────────────────────────────────
    let cellsHtml = '';
    for (const rc of cells) {
      const { colspan, rowspan, val, cell, rightBorderOverride } = rc;
      const font   = cell.font      || {};
      const fill   = cell.fill      || {};
      const border = cell.border    || {};
      const align  = cell.alignment || {};
      const css    = [];

      // Font
      css.push(`font-family:'${font.name || 'Arial'}',Arial,sans-serif`);
      if (font.size)   css.push(`font-size:${font.size}pt`);
      if (font.bold)   css.push('font-weight:bold');
      if (font.italic) css.push('font-style:italic');
      if (font.color && font.color.argb) {
        const fc = argbToCss(font.color.argb);
        if (fc && fc.toUpperCase() !== '#000000') css.push(`color:${fc}`);
      }

      // Fill (skip pattern:none)
      if (fill.type === 'pattern' && fill.pattern !== 'none' && fill.fgColor && fill.fgColor.argb) {
        const bg = argbToCss(fill.fgColor.argb);
        if (bg) css.push(`background-color:${bg}`);
      }

      // Borders — use rightBorderOverride for the right edge when cells were
      // absorbed (e.g. H38 absorbs I38+J38; J38's right border closes the box)
      css.push(`border-top:${borderCss(border.top)}`);
      css.push(`border-right:${borderCss(rightBorderOverride || border.right)}`);
      css.push(`border-bottom:${borderCss(border.bottom)}`);
      css.push(`border-left:${borderCss(border.left)}`);

      // Alignment
      if (align.horizontal && align.horizontal !== 'general') {
        css.push(`text-align:${align.horizontal}`);
      }
      const va = align.vertical;
      css.push(`vertical-align:${(va === 'middle' || va === 'center') ? 'middle' : 'top'}`);

      // Text wrap — let cells size to their colspan; don't clip
      css.push('white-space:normal;word-break:break-word;padding:1px 3px');

      const cs = colspan > 1 ? ` colspan="${colspan}"` : '';
      const rs = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
      cellsHtml += `<td${cs}${rs} style="${css.join(';')}">${val ? esc(val) : '&nbsp;'}</td>`;
    }

    rowsHtml += `<tr style="height:${hPx}px">${cellsHtml}</tr>\n`;
  }

  // ── Logo overlay ────────────────────────────────────────────────────────
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="" style="` +
      `position:absolute;top:0;left:0;` +
      `width:${logoWidthPct.toFixed(1)}%;height:${logoHeightPx}px;` +
      `object-fit:contain;object-position:left center;` +
      `z-index:2;pointer-events:none;padding:2px;">`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff;zoom:${zoom}}
.wrap{position:relative}
table{width:100%;border-collapse:collapse;table-layout:fixed}
td{line-height:1.3;overflow:hidden}
</style></head><body>
<div class="wrap">
${logoHtml}
<table>${colgroup}
${rowsHtml}</table>
</div>
</body></html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUPPETEER HELPER — shared HTML → PDF conversion
// ─────────────────────────────────────────────────────────────────────────────

async function htmlToPdfBuffer(html, margin = '8mm') {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
    }));
  } finally {
    await browser.close();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE → PDF  (JPEG / PNG → single A4 page, centred, using pdf-lib)
// ─────────────────────────────────────────────────────────────────────────────

async function imageToPdf(imageBuffer, format) {
  const A4_W  = 595.28;
  const A4_H  = 841.89;
  const margin = 40;

  const doc  = await PDFDocument.create();
  const page = doc.addPage([A4_W, A4_H]);

  const image = format === 'png'
    ? await doc.embedPng(imageBuffer)
    : await doc.embedJpg(imageBuffer);

  const { width: imgW, height: imgH } = image.size();
  const scale = Math.min((A4_W - margin * 2) / imgW, (A4_H - margin * 2) / imgH, 1);

  page.drawImage(image, {
    x: (A4_W - imgW * scale) / 2,
    y: (A4_H - imgH * scale) / 2,
    width:  imgW * scale,
    height: imgH * scale,
  });

  return Buffer.from(await doc.save());
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCX → PDF  (mammoth → HTML → Puppeteer)
// ─────────────────────────────────────────────────────────────────────────────

async function docxToPdf(docxBuffer) {
  let mammoth;
  try { mammoth = require('mammoth'); } catch { return null; }

  const { value: body } = await mammoth.convertToHtml({ buffer: docxBuffer });
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:11pt}
    table{border-collapse:collapse;width:100%}
    td,th{border:1px solid #ccc;padding:3px 6px}
    img{max-width:100%}
  </style></head><body>${body}</body></html>`;
  return htmlToPdfBuffer(html, '20mm');
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX (supporting doc) → PDF  (ExcelJS basic table → Puppeteer)
// ─────────────────────────────────────────────────────────────────────────────

async function xlsxToPdf(xlsxBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsxBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return null;

  let rows = '';
  sheet.eachRow({ includeEmpty: false }, (row) => {
    let cells = '';
    row.eachCell({ includeEmpty: true }, (cell) => {
      let v = cell.value;
      if (typeof v === 'object' && v !== null) {
        if (v.richText) v = v.richText.map((r) => r.text).join('');
        else v = v.text || v.result || '';
      }
      cells += `<td>${esc(String(v ?? ''))}</td>`;
    });
    rows += `<tr>${cells}</tr>`;
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    body{font-family:Arial,sans-serif;font-size:9pt}
    table{border-collapse:collapse;width:100%}
    td{border:1px solid #ccc;padding:2px 4px;white-space:nowrap}
  </style></head><body><table>${rows}</table></body></html>`;
  return htmlToPdfBuffer(html, '10mm');
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIVERSAL CONVERTER — any supported attachment → PDF buffer
// Returns null (with console warning) for unsupported types instead of crashing
// ─────────────────────────────────────────────────────────────────────────────

async function toSinglePdf(att) {
  const bytes = await read(att.storageKey);
  const mime  = (att.mimeType || '').toLowerCase();
  const ext   = path.extname(att.fileName || '').toLowerCase();

  if (mime === 'application/pdf') return bytes;

  if (mime === 'image/jpeg' || mime === 'image/jpg' || ext === '.jpg' || ext === '.jpeg')
    return imageToPdf(bytes, 'jpeg');

  if (mime === 'image/png' || ext === '.png')
    return imageToPdf(bytes, 'png');

  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/msword' || ext === '.docx' || ext === '.doc'
  ) return docxToPdf(bytes);

  if (
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' || ext === '.xlsx' || ext === '.xls'
  ) return xlsxToPdf(bytes);

  console.warn(`[MergeDocs] Unsupported type "${mime}"/"${ext}" — skipping "${att.fileName}"`);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 — Generate the SES form PDF from the populated Excel template
// ─────────────────────────────────────────────────────────────────────────────

async function generateSesPdf(formId, formIndex = 0) {
  const { workbook, sheet, form } = await populateTemplate(formId, formIndex);

  // Extract logo embedded in the XLSX
  const logoDataUrl = (workbook.media && workbook.media.length)
    ? `data:image/${workbook.media[0].extension};base64,${workbook.media[0].buffer.toString('base64')}`
    : null;

  const html      = sheetToHtml(sheet, logoDataUrl);
  const pdfBuffer = await htmlToPdfBuffer(html, '19mm');

  const fileName       = `SES_${form.workflowId}_form${formIndex + 1}.pdf`;
  const { storageKey } = await save(pdfBuffer, fileName, form.workflowId);
  const attachment     = await insertAttachment({
    workflowId: form.workflowId, fileName, storageKey,
    mimeType: 'application/pdf', size: pdfBuffer.length, source: 'generated',
  });
  return { attachment };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — Merge SES PDF + supporting docs into one final file
//
// • Converts JPG/PNG via pdf-lib embedJpg/embedPng (centred on A4)
// • Converts DOCX via mammoth → Puppeteer
// • Converts XLSX supporting docs via ExcelJS → Puppeteer
// • Skips/warns on unreadable or unsupported files — never crashes the merge
// • Filename uses form data (vendor/po/invoice) so it's always correct
// ─────────────────────────────────────────────────────────────────────────────

async function mergeDocs(workflowId, attachmentIds, formIndex = 0, filenameMeta = null) {
  let idsToMerge = attachmentIds && attachmentIds.length ? attachmentIds : [];
  if (!idsToMerge.length) {
    const { rows: formRows } = await pool.query(
      'SELECT id FROM ses_forms WHERE workflow_id = $1 LIMIT 1', [workflowId]
    );
    if (formRows.length) {
      const ranked = await getFormAttachments(formRows[0].id);
      idsToMerge = ranked.map((r) => r.attachmentId);
    }
  }
  if (!idsToMerge.length) {
    throw Object.assign(new Error('No documents to merge'), { status: 400 });
  }

  const merged = await PDFDocument.create();

  for (const attId of idsToMerge) {
    const att = await getAttachment(attId);
    if (!att) continue;

    let pdfBytes = null;
    try {
      pdfBytes = await toSinglePdf(att);
    } catch (err) {
      console.warn(`[MergeDocs] Conversion failed for "${att.fileName}":`, err.message);
    }
    if (!pdfBytes) continue;

    try {
      const donor = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
      const pages = await merged.copyPages(donor, donor.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    } catch (err) {
      console.warn(`[MergeDocs] Could not merge "${att.fileName}":`, err.message);
    }
  }

  const mergedBytes  = await merged.save();
  const mergedBuffer = Buffer.from(mergedBytes);
  const docHash      = crypto.createHash('sha256').update(mergedBuffer).digest('hex');

  const { rows: wfRows } = await pool.query(
    'SELECT supplier_name, po_number, invoice_number FROM workflows WHERE id = $1',
    [workflowId]
  );
  const wf       = wfRows[0] || {};
  const vendor   = safeName(filenameMeta?.vendor   || wf.supplier_name);
  const po       = safeName(filenameMeta?.po       || wf.po_number);
  const inv      = safeName(filenameMeta?.invoice  || wf.invoice_number);
  const fileName = `SES ${vendor} - ${po} - ${inv}.pdf`;

  const { storageKey } = await save(mergedBuffer, fileName, workflowId);

  const document = await insertSesDocument({
    workflowId, formIndex, fileName, storageKey, docHash, size: mergedBuffer.length,
  });

  await pool.query(
    `INSERT INTO ses_docs (workflow_id, storage_key, doc_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (workflow_id)
     DO UPDATE SET storage_key = $2, doc_hash = $3, created_at = NOW()`,
    [workflowId, storageKey, docHash]
  );

  return { document, docHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1+2 COMBINED — called by the generate-preview route
// ─────────────────────────────────────────────────────────────────────────────

async function generatePreview(formId, formIndex = 0, orderedAttachmentIds = []) {
  const form    = await getSesForm(formId);
  if (!form) throw Object.assign(new Error('SES form not found'), { status: 404 });

  const version = await getLatestFormVersion(formId);
  const data    = extractFormData(version?.data || {}, formIndex);

  // Filter out any previously-generated SES PDFs to prevent double-inclusion
  let filteredAttachmentIds = orderedAttachmentIds;
  if (orderedAttachmentIds.length) {
    const { rows: attRows } = await pool.query(
      `SELECT id FROM attachments WHERE id = ANY($1) AND source = 'generated'`,
      [orderedAttachmentIds]
    );
    const generatedIds = new Set(attRows.map(r => r.id));
    filteredAttachmentIds = orderedAttachmentIds.filter(id => !generatedIds.has(id));
  }

  const { attachment: sesPdfAtt } = await generateSesPdf(formId, formIndex);
  return mergeDocs(
    form.workflowId,
    [sesPdfAtt.id, ...filteredAttachmentIds],
    formIndex,
    { vendor: data.vendorName, po: data.poNumber, invoice: data.invoiceNumber },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFILL EXCEL — fills template with form data, returns XLSX for download
// Shares the same populateTemplate logic so XLSX and PDF always match
// ─────────────────────────────────────────────────────────────────────────────

async function prefillExcel(formId, formIndex = 0) {
  const { workbook, form } = await populateTemplate(formId, formIndex);

  const buffer   = await workbook.xlsx.writeBuffer();
  const fileName = `SES_${form.workflowId}_form${formIndex + 1}.xlsx`;
  const { storageKey } = await save(Buffer.from(buffer), fileName, form.workflowId);

  const attachment = await insertAttachment({
    workflowId: form.workflowId, fileName, storageKey,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: buffer.byteLength, source: 'generated',
  });
  return { attachment };
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE AS PDF — generic HTML → PDF (used by older routes)
// ─────────────────────────────────────────────────────────────────────────────

async function saveAsPdf({ workflowId, formId, htmlContent, fileName: rawName }) {
  const fileName       = rawName || `SES_${workflowId || formId}_document.pdf`;
  const pdfBuffer      = await htmlToPdfBuffer(htmlContent, '15mm');
  const { storageKey } = await save(pdfBuffer, fileName, workflowId);
  const attachment     = await insertAttachment({
    workflowId, fileName, storageKey,
    mimeType: 'application/pdf', size: pdfBuffer.length, source: 'generated',
  });
  return { attachment };
}

// ─────────────────────────────────────────────────────────────────────────────
// STREAM ATTACHMENT — serves a stored file to the HTTP response
// ─────────────────────────────────────────────────────────────────────────────

async function previewDocument(attachmentId, res) {
  const att = await getAttachment(attachmentId);
  if (!att) { res.status(404).json({ error: 'Document not found' }); return; }

  const buffer        = await read(att.storageKey);
  const asciiFallback = att.fileName.replace(/[^\x20-\x7E]/g, '_');
  const encoded       = encodeURIComponent(att.fileName);
  res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`);
  res.send(buffer);
}

module.exports = {
  prefillExcel,
  generateSesPdf,
  generatePreview,
  saveAsPdf,
  mergeDocs,
  previewDocument,
};
