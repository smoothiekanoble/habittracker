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

function usage() {
  return [
    "Usage: node scripts/medm-health/sync-medm-portal.mjs [--days 30] [--headless true|false]",
    "",
    "Required env vars: MEDM_EMAIL, MEDM_PASSWORD, MEDM_RECORD_ID",
    "Optional env vars: MEDM_BASE_URL, MEDM_SYNC_TIMEOUT_SECONDS, MEDM_SYNC_POLL_SECONDS",
  ].join("\n");
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    days: 30,
    headless: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === "--days") {
      options.days = Number(value);
      index += 1;
    } else if (arg === "--headless") {
      options.headless = value !== "false";
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3660) {
    throw new Error("--days must be an integer from 1 to 3660.");
  }

  return options;
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

async function login(page, email, password, baseUrl) {
  await page.goto(`${baseUrl}/en/users/sign_in`, { waitUntil: "domcontentloaded" });
  await fillFirst(page, [
    'input[type="email"]',
    'input[name="user[email]"]',
    'input[name="email"]',
    'input[id*="email" i]',
  ], email);
  await fillFirst(page, [
    'input[type="password"]',
    'input[name="user[password]"]',
    'input[name="password"]',
    'input[id*="password" i]',
  ], password);

  await Promise.all([
    page.waitForLoadState("networkidle").catch(() => {}),
    clickFirst(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Sign in")',
    ]),
  ]);

  const currentUrl = page.url();

  if (/sign_in|login/i.test(currentUrl)) {
    throw new Error("MedM login did not leave the sign-in page.");
  }
}

async function fillFirst(page, selectors, value) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();

    if ((await locator.count()) > 0) {
      await locator.fill(value);
      return;
    }
  }

  throw new Error(`Could not find form field. Tried: ${selectors.join(", ")}`);
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
  const window = localBackfillWindow(options.days);
  const sessionId = safeTimestamp();
  const importDir = ensureImportDir();

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

        console.log(`CSV file found: ${csvPath}`);
        console.log(`Parsed rows: ${summary.rowCount}`);
        console.log(`Parsed date range: ${summary.dateRange}`);

        if (parsed.warnings.length > 0) {
          console.log(`Parser warnings: ${parsed.warnings.length}`);
        }
      }
    } finally {
      await browser.close();
    }

    if (!existsSync(join("supabase", "migrations"))) {
      console.log("TODO: add daily_metrics upsert after the shared metrics schema lands.");
    } else {
      console.log("Dry run only. TODO: wire parsed rows into daily_metrics after schema review.");
    }

    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli(process.argv.slice(2), process.env);
}
