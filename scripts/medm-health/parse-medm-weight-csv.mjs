#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const [, , inputPath] = process.argv;

if (!inputPath) {
  console.error(
    "Usage: node scripts/medm-health/parse-medm-weight-csv.mjs <csv-path>",
  );
  process.exit(1);
}

const DATE_COLUMNS = [
  "date",
  "measurement date",
  "reading date",
  "record date",
  "recorded date",
  "timestamp",
  "date/time",
  "datetime",
  "measurement datetime",
  "created at",
];

const TIME_COLUMNS = [
  "time",
  "measurement time",
  "reading time",
  "record time",
  "recorded time",
];

const VALUE_COLUMNS = [
  "weight",
  "body weight",
  "body mass",
  "mass",
  "value",
  "weight value",
  "bodyweight",
];

const UNIT_COLUMNS = ["unit", "units", "weight unit", "body weight unit"];
const ID_COLUMNS = ["id", "record id", "record_id", "source id", "uuid"];
const SOURCE_DETAIL_COLUMNS = [
  "source",
  "app",
  "device",
  "device name",
  "measurement source",
  "export source",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const delimiter = detectDelimiter(text);

  for (let position = 0; position < text.length; position += 1) {
    const char = text[position];
    const next = text[position + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        position += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
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

function detectDelimiter(text) {
  const [firstLine = ""] = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1);
  const candidates = [",", ";", "\t"];
  const counts = candidates.map((candidate) => ({
    candidate,
    count: countDelimiter(firstLine, candidate),
  }));

  return counts.sort((left, right) => right.count - left.count)[0]?.candidate ?? ",";
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;

  for (let position = 0; position < line.length; position += 1) {
    const char = line[position];
    const next = line[position + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        position += 1;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      count += 1;
    }
  }

  return count;
}

function headerIndex(headers) {
  return new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
}

function normalizeHeader(header) {
  return String(header)
    .replace(/^\uFEFF/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function firstValue(row, index, names) {
  for (const name of names) {
    const column = index.get(normalizeHeader(name));
    if (column !== undefined && row[column] !== undefined && row[column] !== "") {
      return row[column];
    }
  }

  return null;
}

function firstHeaderMatch(headers, names) {
  const normalizedNames = names.map(normalizeHeader);

  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalizedNames.some(
      (name) => normalized === name || normalized.startsWith(`${name} `),
    );
  });
}

function numericValue(value, delimiter) {
  if (value === null || value === "") {
    return null;
  }

  const text = String(value).trim();
  const match = text.match(/[-+]?\d+(?:[,.]\d+)?/);

  if (!match) {
    return null;
  }

  const numericText = match[0];
  const hasDecimalComma = /^[-+]?\d+,\d{1,2}$/.test(numericText);
  const parsed = Number(
    delimiter === ";" || hasDecimalComma
      ? numericText.replace(",", ".")
      : numericText.replaceAll(",", ""),
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function metricDate(dateValue, timeValue) {
  if (!dateValue) {
    return null;
  }

  const dateText = String(dateValue).trim();
  const combinedText = timeValue ? `${dateText} ${String(timeValue).trim()}` : dateText;
  const isoMatch = combinedText.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (isoMatch) {
    return formatDate(isoMatch[1], isoMatch[2], isoMatch[3]);
  }

  const slashMatch = combinedText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);

  if (slashMatch) {
    return formatDate(expandYear(slashMatch[3]), slashMatch[1], slashMatch[2]);
  }

  const dotMatch = combinedText.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);

  if (dotMatch) {
    return formatDate(expandYear(dotMatch[3]), dotMatch[2], dotMatch[1]);
  }

  const parsed = new Date(combinedText);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function expandYear(year) {
  return year.length === 2 ? `20${year}` : year;
}

function formatDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return null;
  }

  return [year.padStart(4, "0"), month.padStart(2, "0"), day.padStart(2, "0")].join("-");
}

function normalizedUnit(unitValue, valueValue, valueHeader) {
  const combined = [unitValue, valueValue, valueHeader]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(lb|lbs|pound|pounds)\b/.test(combined)) {
    return "lb";
  }

  if (/\b(kg|kgs|kilogram|kilograms)\b/.test(combined)) {
    return "kg";
  }

  return null;
}

function sourceDetail(row, index, timeValue) {
  const details = SOURCE_DETAIL_COLUMNS
    .map((name) => firstValue(row, index, [name]))
    .filter(Boolean);

  if (timeValue) {
    details.push(`time ${timeValue}`);
  }

  return details.length > 0 ? details.join("; ") : "medm_weight_csv";
}

function rowHash(headers, row) {
  const canonical = headers
    .map((header, index) => `${normalizeHeader(header)}=${row[index] ?? ""}`)
    .join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

function normalizedRows(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const [headers, ...dataRows] = rows;
  const index = headerIndex(headers);
  const valueHeader = firstHeaderMatch(headers, VALUE_COLUMNS);
  const normalized = [];

  if (!valueHeader) {
    throw new Error(
      `CSV must contain a body-weight column. Tried: ${VALUE_COLUMNS.join(", ")}.`,
    );
  }

  for (const row of dataRows) {
    const dateValue = firstValue(row, index, DATE_COLUMNS);
    const timeValue = firstValue(row, index, TIME_COLUMNS);
    const date = metricDate(dateValue, timeValue);
    const rawValue = firstValue(row, index, VALUE_COLUMNS);
    const value = numericValue(rawValue, delimiter);
    const unit = normalizedUnit(
      firstValue(row, index, UNIT_COLUMNS),
      rawValue,
      valueHeader,
    );
    const sourceRecordId = firstValue(row, index, ID_COLUMNS);
    const rawHash = rowHash(headers, row);

    if (!date || value === null || !unit) {
      continue;
    }

    normalized.push({
      date,
      metric_type: "body_weight",
      value,
      unit,
      source: "medm_health",
      source_detail: sourceDetail(row, index, timeValue),
      ...(sourceRecordId ? { source_record_id: sourceRecordId } : { raw_hash: rawHash }),
    });
  }

  return normalized;
}

const text = readFileSync(inputPath, "utf8");
let normalized;

try {
  normalized = normalizedRows(text);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

console.log(JSON.stringify(normalized, null, 2));
