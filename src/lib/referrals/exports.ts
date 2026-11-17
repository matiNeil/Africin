import { deflateRawSync } from "node:zlib";

/**
 * Report writers for CSV, XLSX and PDF.
 *
 * These are implemented directly against the file formats rather than pulled
 * from a package: a spreadsheet writer and a PDF writer are the kind of
 * dependency that ends up unmaintained inside a payout path, and the subset
 * needed here (one sheet of strings and numbers; one paginated table) is
 * small enough to own, test, and reason about. Every output is a real file of
 * its type -- the tests assert the ZIP/PDF structure, not just the bytes.
 */

export interface ReportTable {
  title: string;
  /** Column headers, in order. */
  columns: string[];
  /** Rows aligned to `columns`. Numbers stay numeric in XLSX. */
  rows: (string | number | null)[][];
  /** Lines printed above the table: filters, generation time, caveats. */
  notes?: string[];
}

// --- CSV --------------------------------------------------------------------

function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const text = String(value);
  // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula on
  // open. Influencer-supplied names and labels flow into these reports, so
  // they are prefixed to stay inert text.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(table: ReportTable): string {
  const lines: string[] = [];
  for (const note of table.notes ?? []) lines.push(csvCell(note));
  if (table.notes?.length) lines.push("");
  lines.push(table.columns.map(csvCell).join(","));
  for (const row of table.rows) lines.push(row.map(csvCell).join(","));
  // CRLF and a UTF-8 BOM: what Excel needs to open an accented name correctly.
  return `﻿${lines.join("\r\n")}\r\n`;
}

// --- ZIP container (for XLSX) -----------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function zip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10); // time
    local.writeUInt16LE(0, 12); // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralDirectory, end]);
}

// --- XLSX -------------------------------------------------------------------

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strips characters XML 1.0 cannot represent at all (lone control bytes). */
function xmlSafe(value: string): string {
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    if (point === 9 || point === 10 || point === 13 || point >= 32) out += value[index];
  }
  return xmlEscape(out);
}

function columnName(index: number): string {
  let name = "";
  let remaining = index + 1;
  while (remaining > 0) {
    const modulo = (remaining - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    remaining = Math.floor((remaining - modulo) / 26);
  }
  return name;
}

function sheetXml(table: ReportTable): string {
  const rows: string[] = [];
  let rowIndex = 1;

  const pushRow = (cells: (string | number | null)[], styleId: number) => {
    const parts = cells.map((value, column) => {
      const reference = `${columnName(column)}${rowIndex}`;
      const style = styleId > 0 ? ` s="${styleId}"` : "";
      if (value == null || value === "") return `<c r="${reference}"${style}/>`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${reference}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlSafe(String(value))}</t></is></c>`;
    });
    rows.push(`<row r="${rowIndex}">${parts.join("")}</row>`);
    rowIndex += 1;
  };

  for (const note of table.notes ?? []) pushRow([note], 0);
  if (table.notes?.length) rowIndex += 1;
  pushRow(table.columns, 1);
  for (const row of table.rows) pushRow(row, 0);

  const widths = table.columns
    .map((header, column) => {
      const longest = table.rows.reduce(
        (max, row) => Math.max(max, String(row[column] ?? "").length),
        header.length
      );
      return `<col min="${column + 1}" max="${column + 1}" width="${Math.min(60, Math.max(10, longest + 2))}" customWidth="1"/>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`;
}

export function toXlsx(table: ReportTable): Buffer {
  // Excel truncates sheet names past 31 characters and rejects : \ / ? * [ ]
  const sheetName = xmlSafe(table.title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31)) || "Report";

  return zip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    },
    {
      name: "xl/styles.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`),
    },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(table)) },
  ]);
}

// --- PDF --------------------------------------------------------------------

const PAGE_WIDTH = 842; // A4 landscape, so a wide report fits without wrapping
const PAGE_HEIGHT = 595;
const MARGIN = 36;
const FONT_SIZE = 8;
const LINE_HEIGHT = 13;
const HELVETICA_AVG_CHAR_WIDTH = 0.52; // em, close enough for column fitting

function pdfText(value: string): string {
  // Base-14 Helvetica with the default encoding covers Latin-1; anything
  // outside it would render as a wrong glyph, so it is replaced visibly
  // rather than silently corrupting a name in a payout report.
  let out = "";
  for (let index = 0; index < value.length; index += 1) {
    const point = value.charCodeAt(index);
    const char = value[index];
    if (point < 32 || point > 255) out += "?";
    else if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else out += char;
  }
  return out;
}

function fitColumns(table: ReportTable): number[] {
  const available = PAGE_WIDTH - MARGIN * 2;
  const natural = table.columns.map((header, column) => {
    const longest = table.rows.reduce(
      (max, row) => Math.max(max, String(row[column] ?? "").length),
      header.length
    );
    return Math.min(longest, 40);
  });
  const totalChars = natural.reduce((sum, value) => sum + value, 0) || 1;
  return natural.map((chars) => Math.max(40, (chars / totalChars) * available));
}

function truncateTo(value: string, width: number): string {
  const maxChars = Math.max(1, Math.floor(width / (FONT_SIZE * HELVETICA_AVG_CHAR_WIDTH)));
  return value.length <= maxChars ? value : `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function toPdf(table: ReportTable): Buffer {
  const widths = fitColumns(table);
  const noteLines = table.notes ?? [];
  const headerBlockHeight = LINE_HEIGHT * (2 + noteLines.length) + 8;
  const rowsPerPage = Math.max(
    1,
    Math.floor((PAGE_HEIGHT - MARGIN * 2 - headerBlockHeight - LINE_HEIGHT * 2) / LINE_HEIGHT)
  );
  const pages: (string | number | null)[][][] = [];
  for (let index = 0; index < table.rows.length; index += rowsPerPage) {
    pages.push(table.rows.slice(index, index + rowsPerPage));
  }
  if (pages.length === 0) pages.push([]);

  const contents = pages.map((rows, pageIndex) => {
    const lines: string[] = ["BT", "/F2 13 Tf", `1 0 0 1 ${MARGIN} ${PAGE_HEIGHT - MARGIN - 13} Tm`, `(${pdfText(table.title)}) Tj`, "ET"];
    let cursor = PAGE_HEIGHT - MARGIN - 13 - LINE_HEIGHT;

    for (const note of noteLines) {
      lines.push("BT", `/F1 ${FONT_SIZE} Tf`, `1 0 0 1 ${MARGIN} ${cursor} Tm`, `(${pdfText(note)}) Tj`, "ET");
      cursor -= LINE_HEIGHT;
    }
    cursor -= 6;

    const drawRow = (cells: (string | number | null)[], font: string) => {
      let x = MARGIN;
      cells.forEach((value, column) => {
        const width = widths[column] ?? 60;
        const text = truncateTo(String(value ?? ""), width);
        lines.push("BT", `/${font} ${FONT_SIZE} Tf`, `1 0 0 1 ${x.toFixed(2)} ${cursor} Tm`, `(${pdfText(text)}) Tj`, "ET");
        x += width;
      });
      cursor -= LINE_HEIGHT;
    };

    drawRow(table.columns, "F2");
    // Rule under the header.
    lines.push(
      "0.6 w",
      `${MARGIN} ${(cursor + LINE_HEIGHT - 3).toFixed(2)} m ${(PAGE_WIDTH - MARGIN).toFixed(2)} ${(cursor + LINE_HEIGHT - 3).toFixed(2)} l S`
    );
    for (const row of rows) drawRow(row, "F1");

    lines.push(
      "BT",
      `/F1 ${FONT_SIZE} Tf`,
      `1 0 0 1 ${MARGIN} ${MARGIN - 12} Tm`,
      `(${pdfText(`Page ${pageIndex + 1} of ${pages.length}`)}) Tj`,
      "ET"
    );
    return lines.join("\n");
  });

  // Object layout: 1 catalog, 2 pages, 3 Helvetica, 4 Helvetica-Bold,
  // then one page object and one content stream per page.
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 5 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";

  pages.forEach((_, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(contents[index], "latin1")} >>\nstream\n${contents[index]}\nendstream`;
  });

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n", "latin1")];
  let position = chunks[0].length;
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = position;
    const body = Buffer.from(`${id} 0 obj\n${objects[id]}\nendobj\n`, "latin1");
    chunks.push(body);
    position += body.length;
  }

  const count = objects.length; // objects.length - 1 real objects, plus slot 0
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "latin1"));

  return Buffer.concat(chunks);
}

export type ReportFormat = "csv" | "xlsx" | "pdf";

export function isReportFormat(value: unknown): value is ReportFormat {
  return value === "csv" || value === "xlsx" || value === "pdf";
}

export function renderReport(
  table: ReportTable,
  format: ReportFormat
): { body: Buffer; contentType: string; extension: string } {
  if (format === "csv") {
    return { body: Buffer.from(toCsv(table), "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  if (format === "xlsx") {
    return {
      body: toXlsx(table),
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }
  return { body: toPdf(table), contentType: "application/pdf", extension: "pdf" };
}
