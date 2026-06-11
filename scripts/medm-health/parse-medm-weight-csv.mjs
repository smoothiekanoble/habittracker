#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DATE_COLUMNS = [
  "date",
  "measurement date",
  "reading date",
  "record date",
  "recorded date",
  "measured at",
  "measurement timestamp",
  "measurement time stamp",
  "recorded at",
  "timestamp",
  "time",
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

const TYPE_COLUMNS = [
  "type",
  "measurement type",
  "metric type",
  "parameter",
  "indicator",
  "measurement",
];

const VALUE_COLUMNS = [
  "weight",
  "body weight",
  "body mass",
  "mass",
  "value",
  "result",
  "result value",
  "measurement value",
  "reading",
  "reading value",
  "weight value",
  "bodyweight",
];

const UNIT_COLUMNS = [
  "unit",
  "units",
  "uom",
  "measure",
  "measurement unit",
  "result unit",
  "value unit",
  "weight unit",
  "body weight unit",
];
const ID_COLUMNS = ["id", "record id", "record_id", "source id", "uuid"];
const SOURCE_DETAIL_COLUMNS = [
  "source",
  "app",
  "device",
  "device name",
  "measurement source",
  "export source",
  "medical record",
  "record",
];

export function parseCsv(text) {
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

export function detectDelimiter(text) {
  const [firstLine = ""] = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1);
  const candidates = [",", ";", "\t"];
  const counts = candidates.map((candidate) => ({
    candidate,
    count: countDelimiter(firstLine, candidate),
  }));

  return counts.sort((left, right) => right.count - left.count)[0]?.candidate ?? ",";
}

export function countDelimiter(line, delimiter) {
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

export function headerIndex(headers) {
  return new Map(
    headers.map((header, index) => [normalizeHeader(header), index]),
  );
}

export function normalizeHeader(header) {
  return String(header)
    .replace(/^\uFEFF/, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function firstValue(row, index, names) {
  for (const name of names) {
    const column = index.get(normalizeHeader(name));
    if (column !== undefined && row[column] !== undefined && row[column] !== "") {
      return row[column];
    }
  }

  return null;
}

export function firstHeaderMatch(headers, names) {
  const normalizedNames = names.map(normalizeHeader);

  return headers.find((header) => {
    const normalized = normalizeHeader(header);
    return normalizedNames.some(
      (name) => normalized === name || normalized.startsWith(`${name} `),
    );
  });
}

function firstHeaderIndex(headers, names) {
  const normalizedNames = names.map(normalizeHeader);

  return headers.findIndex((header) => {
    const normalized = normalizeHeader(header);
    return normalizedNames.some(
      (name) => normalized === name || normalized.startsWith(`${name} `),
    );
  });
}

function findHeaderRow(rows) {
  let best = { index: 0, score: -1 };

  rows.forEach((row, index) => {
    const score =
      headerScore(row, DATE_COLUMNS) +
      headerScore(row, VALUE_COLUMNS) +
      headerScore(row, UNIT_COLUMNS) +
      headerScore(row, TYPE_COLUMNS);

    if (score > best.score) {
      best = { index, score };
    }
  });

  return best.score >= 2 ? best.index : 0;
}

function headerScore(row, names) {
  return firstHeaderIndex(row, names) >= 0 ? 1 : 0;
}

export function numericValue(value, delimiter) {
  if (value === null || value === "") {
    return null;
  }

  const text = String(value).trim();
  const match = text.match(/[-+]?\d+(?:(?:,\d{3})+)?(?:[,.]\d+)?/);

  if (!match) {
    return null;
  }

  const numericText = match[0];
  const hasDecimalComma = /^[-+]?\d+,\d{1,2}$/.test(numericText);
  const hasThousandsComma = /^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numericText);
  const parsed = Number(
    delimiter === ";" || (hasDecimalComma && !hasThousandsComma)
      ? numericText.replace(",", ".")
      : numericText.replaceAll(",", ""),
  );

  return Number.isFinite(parsed) ? parsed : null;
}

export function metricDate(dateValue, timeValue) {
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

export function expandYear(year) {
  return year.length === 2 ? `20${year}` : year;
}

export function formatDate(year, month, day) {
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

export function normalizedUnit(unitValue, valueValue, valueHeader) {
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

function isWeightRow(row, index, sectionLabel) {
  const typeValue = firstValue(row, index, TYPE_COLUMNS);
  const combined = [typeValue, sectionLabel].filter(Boolean).join(" ").toLowerCase();

  if (!combined) {
    return true;
  }

  return /\b(weight|body weight|body mass|mass)\b/.test(combined);
}

export function sourceDetail(row, index, timeValue) {
  const details = SOURCE_DETAIL_COLUMNS
    .map((name) => firstValue(row, index, [name]))
    .filter(Boolean);

  if (timeValue) {
    details.push(`time ${timeValue}`);
  }

  return details.length > 0 ? details.join("; ") : "medm_weight_csv";
}

export function rowHash(headers, row) {
  const canonical = headers
    .map((header, index) => `${normalizeHeader(header)}=${row[index] ?? ""}`)
    .join("|");

  return createHash("sha256").update(canonical).digest("hex");
}

function inferredSectionLabel(rows, headerRowIndex) {
  for (let index = headerRowIndex - 1; index >= 0; index -= 1) {
    const row = rows[index].filter(Boolean);

    if (row.length === 1) {
      return row[0];
    }
  }

  return null;
}

export function parseMedmWeightCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text);

  if (rows.length < 2) {
    throw new Error("CSV must contain a header row and at least one data row.");
  }

  const headerRowIndex = findHeaderRow(rows);
  const headers = rows[headerRowIndex];
  const dataRows = rows.slice(headerRowIndex + 1);
  const sectionLabel = inferredSectionLabel(rows, headerRowIndex);
  const index = headerIndex(headers);
  const valueHeader = firstHeaderMatch(headers, VALUE_COLUMNS);
  const normalized = [];
  const warnings = [];
  const headerNames = headers.map((header) => String(header).replace(/^\uFEFF/, "").trim());

  if (!valueHeader) {
    throw new Error(
      `CSV must contain a body-weight value column. Headers: ${headerNames.join(", ")}. Tried: ${VALUE_COLUMNS.join(", ")}.`,
    );
  }

  dataRows.forEach((row, rowIndex) => {
    const rowNumber = headerRowIndex + rowIndex + 2;
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

    const rowWarnings = [];

    if (!isWeightRow(row, index, sectionLabel)) {
      return;
    }

    if (!date) {
      rowWarnings.push("missing or unparseable date");
    }

    if (value === null) {
      rowWarnings.push("missing or nonnumeric body weight");
    }

    if (!unit) {
      rowWarnings.push("missing or unsupported unit");
    }

    if (rowWarnings.length > 0) {
      warnings.push({
        row_number: rowNumber,
        reason: rowWarnings.join("; "),
      });
      return;
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
  });

  return { rows: normalized, warnings, header_names: headerNames };
}

function warningLine(warning) {
  return `Warning row ${warning.row_number}: ${warning.reason}`;
}

export function runCli(argv = process.argv) {
  const [, , inputPath] = argv;

  if (!inputPath) {
    console.error(
      "Usage: node scripts/medm-health/parse-medm-weight-csv.mjs <csv-path>",
    );
    return 1;
  }

  try {
    const text = readFileSync(inputPath, "utf8");
    const result = parseMedmWeightCsv(text);

    if (result.warnings.length > 0 || result.rows.length === 0) {
      console.error(`CSV headers: ${result.header_names.join(", ")}`);
    }

    for (const warning of result.warnings) {
      console.error(warningLine(warning));
    }

    if (result.rows.length === 0) {
      console.error("No valid MedM body-weight rows were found.");
      return 1;
    }

    console.log(JSON.stringify(result.rows, null, 2));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli(process.argv);
}
