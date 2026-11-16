import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderReport, toCsv, toPdf, toXlsx, type ReportTable } from "../../src/lib/referrals/exports.ts";

const table: ReportTable = {
  title: "Influencer performance - Tendai M",
  columns: ["Metric", "Value"],
  notes: ["Range: 2026-03-01 to 2026-03-31", "Generated: 2026-04-01T00:00:00.000Z"],
  rows: [
    ["Clicks", 1200],
    ["First payments", 48],
    ["Historical earnings (USD)", "119.76"],
    ['Odd "name" with, commas', "ok"],
  ],
};

test("CSV quotes separators and quotes, and opens cleanly in Excel", () => {
  const csv = toCsv(table);
  assert.ok(csv.startsWith("﻿"), "needs a BOM for Excel to read UTF-8");
  assert.ok(csv.includes("\r\n"));
  assert.ok(csv.includes('"Odd ""name"" with, commas"'));
  assert.ok(csv.includes("Metric,Value"));
});

test("CSV neutralises cells a spreadsheet would run as a formula", () => {
  const csv = toCsv({
    title: "t",
    columns: ["Name"],
    rows: [['=HYPERLINK("http://evil","click")'], ["+1234"], ["-cmd"], ["@sum"]],
  });
  for (const line of csv.split("\r\n").slice(1)) {
    if (!line) continue;
    assert.ok(!/^"?[=+\-@]/.test(line), `unguarded formula cell: ${line}`);
  }
});

test("XLSX is a real ZIP holding the parts Excel requires", () => {
  const buffer = toXlsx(table);
  assert.equal(buffer.subarray(0, 2).toString("latin1"), "PK");
  const text = buffer.toString("latin1");
  for (const part of [
    "[Content_Types].xml",
    "xl/workbook.xml",
    "xl/worksheets/sheet1.xml",
    "xl/styles.xml",
    "_rels/.rels",
  ]) {
    assert.ok(text.includes(part), `missing part: ${part}`);
  }
});

test("XLSX survives a real unzip and keeps numbers numeric", () => {
  const dir = mkdtempSync(join(tmpdir(), "africin-xlsx-"));
  const file = join(dir, "report.xlsx");
  writeFileSync(file, toXlsx(table));
  // `unzip -t` verifies every entry's CRC: a hand-rolled container that got
  // its checksums or offsets wrong fails here rather than in Excel.
  const check = execFileSync("unzip", ["-t", file], { encoding: "utf8" });
  assert.ok(check.includes("No errors detected"));

  const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
  assert.ok(sheet.includes("<v>1200</v>"), "numbers must not be written as text");
  assert.ok(sheet.includes("Historical earnings (USD)"));
});

test("XLSX escapes XML and drops characters the format cannot carry", () => {
  const dir = mkdtempSync(join(tmpdir(), "africin-xlsx-"));
  const file = join(dir, "escapes.xlsx");
  writeFileSync(
    file,
    toXlsx({
      title: "t",
      columns: ["Name"],
      rows: [[`Ampersand & <tag> ${String.fromCharCode(7)}bell`]],
    })
  );
  // Read the decompressed part: the entry has to be unzipped before its
  // contents can be asserted on at all.
  const sheet = execFileSync("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
  assert.ok(sheet.includes("Ampersand &amp; &lt;tag&gt;"));
  assert.ok(!sheet.includes("<tag>"));
  assert.ok(!sheet.includes(String.fromCharCode(7)), "control characters are not valid XML 1.0");
});

test("PDF is a structurally valid document with a cross-reference table", () => {
  const buffer = toPdf(table);
  const text = buffer.toString("latin1");
  assert.ok(text.startsWith("%PDF-1."));
  assert.ok(text.includes("/Type /Catalog"));
  assert.ok(text.includes("/Type /Pages"));
  assert.ok(text.includes("/BaseFont /Helvetica"));
  assert.ok(text.trimEnd().endsWith("%%EOF"));

  // startxref must point at the real byte offset of the xref table, or no
  // reader will open the file.
  const startxref = Number(text.slice(text.lastIndexOf("startxref") + 9).trim().split("\n")[0]);
  assert.equal(text.slice(startxref, startxref + 4), "xref");
});

test("PDF paginates long reports instead of overflowing one page", () => {
  const long: ReportTable = {
    ...table,
    rows: Array.from({ length: 200 }, (_, index) => [`Row ${index}`, index]),
  };
  const text = toPdf(long).toString("latin1");
  const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
  assert.ok(pageCount > 1, `expected multiple pages, got ${pageCount}`);
  assert.ok(text.includes("Page 1 of "));
});

test("PDF escapes characters that would otherwise break the content stream", () => {
  const text = toPdf({
    title: "Paren ( test )",
    columns: ["A"],
    rows: [["back\\slash and (parens)"]],
  }).toString("latin1");
  assert.ok(text.includes("Paren \\( test \\)"));
  assert.ok(text.includes("back\\\\slash"));
});

test("each format reports the content type a browser needs to download it", () => {
  assert.equal(renderReport(table, "csv").contentType, "text/csv; charset=utf-8");
  assert.equal(
    renderReport(table, "xlsx").contentType,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  assert.equal(renderReport(table, "pdf").contentType, "application/pdf");
  assert.equal(renderReport(table, "pdf").extension, "pdf");
});

test("an empty report still produces a valid file of each type", () => {
  const empty: ReportTable = { title: "Nothing yet", columns: ["Metric", "Value"], rows: [] };
  assert.ok(toCsv(empty).includes("Metric,Value"));
  assert.equal(toXlsx(empty).subarray(0, 2).toString("latin1"), "PK");
  assert.ok(toPdf(empty).toString("latin1").startsWith("%PDF"));
});
