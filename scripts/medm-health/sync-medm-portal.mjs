#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseMedmWeightCsv } from "./parse-medm-weight-csv.mjs";

const PORTAL_ORIGIN = "https://health.medm.com";
const IMPORT_ROOT = join("local-data", "imports", "medm-health");
const DEBUG_ROOT = join(IMPORT_ROOT, "debug");

export const LOGIN_PATHS = [
  "/en/user/login",
  "/en",
  "/en/users/sign_in",
];

export const EMAIL_LOGIN_SELECTORS = [
  'input[type="email"]',
  'input[name="user[email]"]',
  'input[name="email"]',
  'input[name="login"]',
  'input[name="username"]',
  'input[autocomplete="email"]',
  'input[autocomplete="username"]',
  'input[id*="email" i]',
  'input[id*="login" i]',
  'input[id*="username" i]',
  'input[type="text"]',
];

export const PASSWORD_SELECTORS = [
  'input[type="password"]',
  'input[name="user[password]"]',
  'input[name="password"]',
  'input[autocomplete="current-password"]',
  'input[id*="password" i]',
];

export const SUBMIT_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'input[name="commit"]',
  'button:has-text("Sign In")',
  'button:has-text("Log in")',
  'button:has-text("Sign in")',
  'input[value="Sign In"]',
  'input[value="Log in"]',
];

function usage() {
  return [
    "Usage: node scripts/medm-health/sync-medm-portal.mjs [--lifetime] [--days 30] [--from-date YYYY-MM-DD] [--headless true|false] [--import]",
    "",
    "Required env vars: MEDM_EMAIL, MEDM_PASSWORD, MEDM_RECORD_ID",
    "Import env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_METRICS_USER_ID",
    "Optional env vars: MEDM_BASE_URL, MEDM_SYNC_TIMEOUT_SECONDS, MEDM_SYNC_POLL_SECONDS",
  ].join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    days: 30,
    fromDate: null,
    headless: true,
    dryRun: true,
    lifetime: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--days") {
      options.days = Number(value);
      options.lifetime = false;
      index += 1;
    } else if (arg === "--from-date") {
      options.fromDate = value;
      options.lifetime = false;
      index += 1;
    } else if (arg === "--lifetime") {
      options.lifetime = true;
      options.fromDate = null;
    } else if (arg === "--headless") {
      options.headless = value !== "false";
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = value !== "false";
      index += 1;
    } else if (arg === "--import") {
      options.dryRun = false;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3660) {
    throw new Error("--days must be an integer from 1 to 3660.");
  }

  if (options.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(options.fromDate)) {
    throw new Error("--from-date must use YYYY-MM-DD.");
  }

  return options;
}

export function metricEventPayload(row, userId) {
  const sourceRecordId = row.source_record_id || fallbackEventSourceRecordId(row);

  return {
    user_id: userId,
    occurred_at: row.occurred_at,
    metric_date: row.metric_date ?? row.date,
    metric_type: row.metric_type,
    value: row.value,
    unit: row.unit,
    source: row.source,
    source_record_id: sourceRecordId,
    source_detail: row.source_detail ?? null,
    raw_metadata: row.raw_metadata ?? {},
  };
}

export function metricEventPayloads(rows, userId) {
  return dedupeMetricEventRows(rows).map((row) => metricEventPayload(row, userId));
}

export function dedupeMetricEventRows(rows) {
  const bySourceRecordId = new Map();

  for (const row of rows) {
    bySourceRecordId.set(row.source_record_id || fallbackEventSourceRecordId(row), row);
  }

  return [...bySourceRecordId.values()];
}

function fallbackEventSourceRecordId(row) {
  return [
    row.source,
    row.metric_type,
    row.occurred_at,
    row.value,
    row.unit,
  ].join("|");
}

export function dailyMetricPayload(row, userId) {
  const sourceDetail = {
    detail: row.source_detail ?? null,
    source_record_id: row.source_record_id ?? null,
    occurred_at: row.occurred_at ?? null,
  };

  return {
    user_id: userId,
    metric_date: row.metric_date ?? row.date,
    metric_type: row.metric_type,
    value: row.value,
    unit: row.unit,
    source: row.source,
    source_detail: Object.fromEntries(
      Object.entries(sourceDetail).filter(([, value]) => value !== null),
    ),
  };
}

export function dailyMetricPayloads(rows, userId) {
  return deriveDailyMetricRows(rows).map((row) => dailyMetricPayload(row, userId));
}

export function deriveDailyMetricRows(rows) {
  const sortedRows = [...rows].sort((left, right) =>
    stableMetricRowSortKey(left).localeCompare(stableMetricRowSortKey(right)),
  );
  const byDailyMetric = new Map();

  for (const row of sortedRows) {
    byDailyMetric.set(metricRowKey(row), row);
  }

  return [...byDailyMetric.values()];
}

function metricRowKey(row) {
  return [row.metric_date ?? row.date, row.metric_type, row.source].join("|");
}

function stableMetricRowSortKey(row) {
  return [
    row.metric_date ?? row.date,
    row.metric_type,
    row.source,
    row.occurred_at ?? "",
    row.source_detail ?? "",
    row.source_record_id ?? "",
    row.raw_hash ?? "",
  ].join("|");
}

export function localBackfillWindow(days, now = new Date()) {
  const endLocal = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );
  const startLocal = new Date(
    endLocal.getFullYear(),
    endLocal.getMonth(),
    endLocal.getDate() - days + 1,
    0,
    0,
    0,
    0,
  );

  return {
    fromDate: startLocal.toISOString(),
    toDate: endLocal.toISOString(),
    localStartDate: dateOnly(startLocal),
    localEndDate: dateOnly(endLocal),
  };
}

export function localFromDateWindow(fromDate, now = new Date()) {
  const [year, month, day] = fromDate.split("-").map(Number);
  const startLocal = new Date(year, month - 1, day, 0, 0, 0, 0);
  const endLocal = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  return {
    fromDate: startLocal.toISOString(),
    toDate: endLocal.toISOString(),
    localStartDate: dateOnly(startLocal),
    localEndDate: dateOnly(endLocal),
  };
}

export function syncWindow(options, now = new Date()) {
  if (options.lifetime) {
    return localFromDateWindow("1970-01-01", now);
  }

  if (options.fromDate) {
    return localFromDateWindow(options.fromDate, now);
  }

  return localBackfillWindow(options.days, now);
}

export function findReportLinks(html, recordId) {
  const escapedRecordId = escapeRegExp(recordId);
  const pattern = new RegExp(
    `/en/records/${escapedRecordId}/download_report\\?id=([0-9a-fA-F-]{8,})`,
    "g",
  );
  const seen = new Set();
  const links = [];
  let match;

  while ((match = pattern.exec(html)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      links.push(`/en/records/${recordId}/download_report?id=${match[1]}`);
    }
  }

  return links;
}

export function extractCsvFilesFromZip(zipBuffer) {
  const entries = [];
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);

    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 22);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraLength = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > zipBuffer.length) {
      throw new Error("ZIP entry extends past end of file.");
    }

    const name = zipBuffer.toString("utf8", nameStart, nameEnd);
    const compressed = zipBuffer.subarray(dataStart, dataEnd);
    const bytes =
      compressionMethod === 0
        ? compressed
        : compressionMethod === 8
          ? inflateRawSync(compressed)
          : null;

    if (!bytes) {
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${name}.`);
    }

    if (uncompressedSize !== 0 && bytes.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch for ${name}.`);
    }

    if (name.toLowerCase().endsWith(".csv")) {
      entries.push({
        name: basename(name),
        text: bytes.toString("utf8"),
      });
    }

    offset = dataEnd;
  }

  return entries;
}

export function summarizeRows(rows) {
  const dates = rows.map((row) => row.date).sort();

  return {
    rowCount: rows.length,
    dateRange: dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : "none",
  };
}

export function summarizeParsedFiles(parsedFiles) {
  const rows = parsedFiles.flatMap((file) => file.rows);
  const warnings = parsedFiles.reduce((total, file) => total + file.warnings.length, 0);
  const summary = summarizeRows(rows);

  return {
    eventRowCount: summary.rowCount,
    rowCount: summary.rowCount,
    dateRange: summary.dateRange,
    warningCount: warnings,
    fileCount: parsedFiles.length,
    uniqueEventCount: dedupeMetricEventRows(rows).length,
    dailyMetricCount: deriveDailyMetricRows(rows).length,
    uniqueDailyMetricCount: deriveDailyMetricRows(rows).length,
  };
}

async function login(page, email, password, baseUrl) {
  const fields = await findLoginFields(page, baseUrl);

  if (!fields) {
    const debugPath = await saveLoginDebugArtifact(page, "login-fields-not-found");
    throw new Error(
      `Could not find MedM login fields. Debug artifact saved under ${debugPath}.`,
    );
  }

  await fields.email.fill(email);
  await fields.password.fill(password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    clickFirst(page, SUBMIT_SELECTORS),
  ]);

  const currentUrl = page.url();

  if (/sign_in|login/i.test(currentUrl)) {
    throw new Error("MedM login did not leave the sign-in page.");
  }
}

async function findLoginFields(page, baseUrl) {
  for (const path of LOGIN_PATHS) {
    await page.goto(`${baseUrl}${path}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await logPageLocation(page, `Checking MedM login page ${path}`);

    const email = await locateFirst(page, EMAIL_LOGIN_SELECTORS);
    const password = await locateFirst(page, PASSWORD_SELECTORS);

    if (email && password) {
      return { email, password };
    }
  }

  await page.goto(`${baseUrl}${LOGIN_PATHS[0]}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await logPageLocation(page, "Saving MedM login debug artifacts from primary login page");

  return null;
}

async function locateFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if ((await locator.count()) > 0) {
      return locator;
    }
  }

  return null;
}

async function clickFirst(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if ((await locator.count()) > 0) {
      await locator.click();
      return;
    }
  }

  throw new Error(`Could not find submit control. Tried: ${selectors.join(", ")}`);
}

async function logPageLocation(page, label) {
  console.log(`${label}: url=${page.url()} title=${await page.title()}`);
}

async function saveLoginDebugArtifact(page, reason) {
  mkdirSync(DEBUG_ROOT, { recursive: true });
  const html = sanitizeHtmlForDebug(await page.content());
  const metadata = [
    `url: ${page.url()}`,
    `title: ${await page.title()}`,
    `reason: ${reason}`,
  ].join("\n");

  writeFileSync(join(DEBUG_ROOT, "login-page.txt"), `${metadata}\n`);
  writeFileSync(join(DEBUG_ROOT, "login-page.html"), html);
  await page.screenshot({ path: join(DEBUG_ROOT, "login-page.png"), fullPage: true });

  return DEBUG_ROOT;
}

export function sanitizeHtmlForDebug(html) {
  return String(html)
    .replace(
      /(<input\b[^>]*\b(?:value|data-[^=]+)=["'])[^"']*(["'][^>]*>)/gi,
      "$1[redacted]$2",
    )
    .replace(
      /(<meta\b[^>]*\b(?:content)=["'])[^"']*(["'][^>]*>)/gi,
      "$1[redacted]$2",
    )
    .replace(/authenticity_token["'][^>]*value=["'][^"']*["']/gi, 'authenticity_token" value="[redacted]"')
    .replace(/csrf-token["']\s+content=["'][^"']*["']/gi, 'csrf-token" content="[redacted]"');
}

function extractAuthenticityToken(html) {
  return (
    html.match(/name=["']authenticity_token["'][^>]*value=["']([^"']+)["']/i)?.[1] ??
    html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i)?.[1] ??
    null
  );
}

async function createReport(context, baseUrl, recordId, window) {
  const reportsUrl = `${baseUrl}/en/records/${recordId}/reports`;
  const formPage = await context.request.get(reportsUrl);
  const html = await formPage.text();
  const token = extractAuthenticityToken(html);
  const form = {
    from_date: window.fromDate,
    to_date: window.toDate,
    medical_record_id: recordId,
    queue_period: "never",
    end_generation_at: "",
    end_generation_at_field: "",
    disabled_types_url: `/en/records/${recordId}/disabled_types`,
    "select-all": "1",
    "measurement_types[]": "weight",
    format: "csv",
    group_by: "type",
    commit: "Order Report",
    ...(token ? { authenticity_token: token } : {}),
  };

  const response = await context.request.post(reportsUrl, {
    form,
    maxRedirects: 0,
  });

  if (![200, 302, 303].includes(response.status())) {
    throw new Error(`MedM report create returned HTTP ${response.status()}.`);
  }
}

async function reportLinks(context, baseUrl, recordId) {
  const reportsUrl = `${baseUrl}/en/records/${recordId}/reports`;
  const response = await context.request.get(reportsUrl);

  if (!response.ok()) {
    throw new Error(`MedM reports page returned HTTP ${response.status()}.`);
  }

  return findReportLinks(await response.text(), recordId);
}

async function newestReportLink(
  context,
  baseUrl,
  recordId,
  timeoutSeconds,
  pollSeconds,
  existingLinks,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutSeconds * 1000) {
    const links = await reportLinks(context, baseUrl, recordId);
    const newLink = links.find((link) => !existingLinks.has(link));

    if (newLink) {
      return newLink;
    }

    await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
  }

  throw new Error("Timed out waiting for a completed MedM report download link.");
}

async function downloadReport(context, baseUrl, link) {
  const response = await context.request.get(`${baseUrl}${link}`);

  if (!response.ok()) {
    throw new Error(`MedM report download returned HTTP ${response.status()}.`);
  }

  const contentType = response.headers()["content-type"] ?? "";

  if (!contentType.includes("zip")) {
    throw new Error(`Expected ZIP report response, got content-type: ${contentType}`);
  }

  return Buffer.from(await response.body());
}

async function upsertDailyMetrics(rows, env) {
  const missing = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_METRICS_USER_ID",
  ].filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing import env vars: ${missing.join(", ")}`);
  }

  if (rows.length === 0) {
    return { upsertedRows: 0 };
  }

  const payloads = dailyMetricPayloads(rows, env.SUPABASE_METRICS_USER_ID);
  const url = new URL("/rest/v1/daily_metrics", env.SUPABASE_URL);
  url.searchParams.set("on_conflict", "user_id,metric_date,metric_type,source");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payloads),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`daily_metrics upsert failed with HTTP ${response.status}: ${errorText}`);
  }

  return { upsertedRows: payloads.length };
}

async function upsertMetricEvents(rows, env) {
  const missing = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_METRICS_USER_ID",
  ].filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing import env vars: ${missing.join(", ")}`);
  }

  if (rows.length === 0) {
    return { upsertedRows: 0 };
  }

  const payloads = metricEventPayloads(rows, env.SUPABASE_METRICS_USER_ID);
  const url = new URL("/rest/v1/metric_events", env.SUPABASE_URL);
  url.searchParams.set("on_conflict", "user_id,source,source_record_id");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(payloads),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`metric_events upsert failed with HTTP ${response.status}: ${errorText}`);
  }

  return { upsertedRows: payloads.length };
}

function ensureImportDir() {
  mkdirSync(IMPORT_ROOT, { recursive: true });
  return IMPORT_ROOT;
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function dateOnly(date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function runCli(argv = process.argv.slice(2), env = process.env) {
  let options;

  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    return 1;
  }

  if (options.help) {
    console.log(usage());
    return 0;
  }

  const missing = ["MEDM_EMAIL", "MEDM_PASSWORD", "MEDM_RECORD_ID"].filter(
    (name) => !env[name],
  );

  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(", ")}`);
    return 1;
  }

  const baseUrl = env.MEDM_BASE_URL ?? PORTAL_ORIGIN;
  const timeoutSeconds = Number(env.MEDM_SYNC_TIMEOUT_SECONDS ?? 120);
  const pollSeconds = Number(env.MEDM_SYNC_POLL_SECONDS ?? 10);
  const window = syncWindow(options);
  const sessionId = safeTimestamp();
  const importDir = ensureImportDir();
  const parsedFiles = [];

  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: options.headless });
    const context = await browser.newContext({ baseURL: baseUrl });
    const page = await context.newPage();

    try {
      await login(page, env.MEDM_EMAIL, env.MEDM_PASSWORD, baseUrl);
      const existingLinks = new Set(
        await reportLinks(context, baseUrl, env.MEDM_RECORD_ID),
      );
      await createReport(context, baseUrl, env.MEDM_RECORD_ID, window);
      console.log(
        `MedM report requested for ${window.localStartDate} to ${window.localEndDate}.`,
      );

      const link = await newestReportLink(
        context,
        baseUrl,
        env.MEDM_RECORD_ID,
        timeoutSeconds,
        pollSeconds,
        existingLinks,
      );
      const zipBytes = await downloadReport(context, baseUrl, link);
      const zipPath = join(importDir, `medm-weight-${sessionId}.zip`);
      writeFileSync(zipPath, zipBytes);
      console.log(`MedM report downloaded: ${zipPath}`);

      const csvFiles = extractCsvFilesFromZip(zipBytes);

      if (csvFiles.length === 0) {
        throw new Error("Downloaded ZIP did not contain a CSV file.");
      }

      for (const csvFile of csvFiles) {
        const csvHash = createHash("sha256").update(csvFile.text).digest("hex").slice(0, 12);
        const csvPath = join(importDir, `medm-weight-${sessionId}-${csvHash}.csv`);
        writeFileSync(csvPath, csvFile.text);
        const parsed = parseMedmWeightCsv(csvFile.text);
        const summary = summarizeRows(parsed.rows);
        parsedFiles.push({
          path: csvPath,
          rows: parsed.rows,
          warnings: parsed.warnings,
        });

        console.log(`CSV file found: ${csvPath}`);
        console.log(`Parsed rows: ${summary.rowCount}`);
        console.log(`Parsed date range: ${summary.dateRange}`);
        console.log(
          "Normalized fields: occurred_at, metric_date, metric_type, value, unit, source, source_record_id, source_detail.",
        );

        if (parsed.warnings.length > 0) {
          console.log(`Parser warnings: ${parsed.warnings.length}`);
          for (const reason of warningReasons(parsed.warnings)) {
            console.log(`Parser warning reason: ${reason}`);
          }
        }

        if (parsed.rows.length === 0) {
          console.log(`CSV headers: ${parsed.header_names.join(", ")}`);
        }
      }
    } finally {
      await browser.close();
    }

    const totalSummary = summarizeParsedFiles(parsedFiles);

    if (totalSummary.eventRowCount === 0) {
      throw new Error("No valid MedM body-weight rows were parsed from the downloaded report.");
    }

    console.log(
      `MedM weight sync summary: ${totalSummary.eventRowCount} event rows across ${totalSummary.fileCount} CSV file(s), ${totalSummary.dateRange}.`,
    );
    console.log(`Unique event rows ready for upsert: ${totalSummary.uniqueEventCount}`);
    console.log(`Daily summary rows ready for upsert: ${totalSummary.dailyMetricCount}`);

    if (options.dryRun) {
      console.log("Dry run only. Pass --import to upsert into metric_events and daily_metrics.");
    } else if (!existsSync(join("supabase", "migrations"))) {
      throw new Error("Cannot import because supabase/migrations is missing.");
    } else {
      const rows = parsedFiles.flatMap((file) => file.rows);
      const eventResult = await upsertMetricEvents(rows, env);
      const dailyResult = await upsertDailyMetrics(rows, env);
      console.log(`Imported event rows into metric_events: ${eventResult.upsertedRows}`);
      console.log(`Imported daily rows into daily_metrics: ${dailyResult.upsertedRows}`);
    }

    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

function warningReasons(warnings) {
  return [...new Set(warnings.map((warning) => warning.reason))];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2), process.env);
}
