#!/usr/bin/env node
import { readFileSync } from "node:fs";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error("Usage: node scripts/medm-health/parse-medm-weight-csv.mjs <csv-path>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some(Boolean));
}

function headerIndex(headers) {
  return new Map(headers.map((header, index) => [header.toLowerCase(), index]));
}

function firstValue(row, index, names) {
  for (const name of names) {
    const column = index.get(name.toLowerCase());
    if (column !== undefined && row[column] !== undefined && row[column] !== "") {
      return row[column];
    }
  }

  return null;
}

function numericValue(value) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

const rows = parseCsv(readFileSync(inputPath, "utf8"));

if (rows.length < 2) {
  console.error("CSV must contain a header row and at least one data row.");
  process.exit(1);
}

const [headers, ...dataRows] = rows;
const index = headerIndex(headers);
const normalized = [];

for (const row of dataRows) {
  const date = firstValue(row, index, ["date", "measurement date", "timestamp"]);
  const time = firstValue(row, index, ["time", "measurement time"]);
  const value = numericValue(firstValue(row, index, ["weight", "body weight", "body mass"]));

  if (!date || value === null) {
    continue;
  }

  normalized.push({
    date,
    metric_type: "body_weight",
    value,
    unit: firstValue(row, index, ["unit", "weight unit"]) ?? "unknown",
    source: "medm_health",
    source_detail: time ? `synthetic_weight_csv ${time}` : "synthetic_weight_csv",
  });
}

console.log(JSON.stringify(normalized, null, 2));
