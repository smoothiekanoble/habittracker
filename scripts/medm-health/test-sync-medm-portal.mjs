#!/usr/bin/env node
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  EMAIL_LOGIN_SELECTORS,
  LOGIN_PATHS,
  PASSWORD_SELECTORS,
  dailyMetricPayload,
  dailyMetricPayloads,
  dedupeDailyMetricRows,
  extractCsvFilesFromZip,
  findReportLinks,
  localBackfillWindow,
  parseArgs,
  sanitizeHtmlForDebug,
  summarizeParsedFiles,
  summarizeRows,
} from "./sync-medm-portal.mjs";

const args = parseArgs(["--days", "14", "--headless", "false"]);
assert.equal(args.days, 14);
assert.equal(args.headless, false);
assert.equal(args.dryRun, true);
assert.equal(parseArgs(["--import"]).dryRun, false);
assert.equal(parseArgs(["--dry-run", "false"]).dryRun, false);
assert.throws(() => parseArgs(["--days", "0"]), /--days/);

assert.equal(LOGIN_PATHS[0], "/en/user/login");
assert.deepEqual(LOGIN_PATHS, [
  "/en/user/login",
  "/en",
  "/en/users/sign_in",
]);
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[type="text"]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[name="login"]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[name="username"]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[id*="login" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[id*="username" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[autocomplete="email"]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[autocomplete="username"]'));
assert.ok(PASSWORD_SELECTORS.includes('input[name="password"]'));
assert.ok(PASSWORD_SELECTORS.includes('input[id*="password" i]'));
assert.ok(PASSWORD_SELECTORS.includes('input[autocomplete="current-password"]'));

const sanitized = sanitizeHtmlForDebug(`
  <meta name="csrf-token" content="csrf-secret">
  <input name="email" value="person@example.com">
  <input name="password" value="password-secret">
  <input type="hidden" name="authenticity_token" value="token-secret">
`);
assert.doesNotMatch(sanitized, /person@example\.com|password-secret|token-secret|csrf-secret/);
assert.match(sanitized, /\[redacted\]/);

const metricPayload = dailyMetricPayload(
  sampleMetricRow(),
  "00000000-0000-0000-0000-000000000001",
);
assert.deepEqual(metricPayload, {
  user_id: "00000000-0000-0000-0000-000000000001",
  metric_date: "2026-06-10",
  metric_type: "body_weight",
  value: 180.1,
  unit: "lb",
  source: "medm_health",
  source_detail: {
    detail: "MedM Health CSV; time 07:01",
    raw_hash: "abc123",
  },
});
assert.deepEqual(dailyMetricPayloads([sampleMetricRow()], "user-1"), [
  {
    user_id: "user-1",
    metric_date: "2026-06-10",
    metric_type: "body_weight",
    value: 180.1,
    unit: "lb",
    source: "medm_health",
    source_detail: {
      detail: "MedM Health CSV; time 07:01",
      raw_hash: "abc123",
    },
  },
]);
const duplicateDailyRows = [
  { ...sampleMetricRow(), source_detail: "MedM Health CSV; time 07:01", raw_hash: "a" },
  { ...sampleMetricRow(), source_detail: "MedM Health CSV; time 07:05", raw_hash: "b" },
];
assert.equal(dedupeDailyMetricRows(duplicateDailyRows).length, 1);
assert.equal(dailyMetricPayloads(duplicateDailyRows, "user-1").length, 1);

function sampleMetricRow() {
  return {
    date: "2026-06-10",
    metric_type: "body_weight",
    value: 180.1,
    unit: "lb",
    source: "medm_health",
    source_detail: "MedM Health CSV; time 07:01",
    raw_hash: "abc123",
  };
}

const window = localBackfillWindow(2, new Date(2026, 5, 10, 12, 30, 0));
assert.equal(window.localStartDate, "2026-06-09");
assert.equal(window.localEndDate, "2026-06-10");
assert.match(window.fromDate, /^2026-06-09T/);
assert.match(window.toDate, /^2026-06-11T|^2026-06-10T/);

const html = `
  <a href="/en/records/abc123/download_report?id=11111111-1111-1111-1111-111111111111">old</a>
  <a href="/en/records/abc123/download_report?id=22222222-2222-2222-2222-222222222222">new</a>
  <a href="/en/records/other/download_report?id=33333333-3333-3333-3333-333333333333">other</a>
`;
assert.deepEqual(findReportLinks(html, "abc123"), [
  "/en/records/abc123/download_report?id=11111111-1111-1111-1111-111111111111",
  "/en/records/abc123/download_report?id=22222222-2222-2222-2222-222222222222",
]);

const csv = "Date,Weight,Unit\n2026-06-10,180.1,lb\n";
const zip = syntheticZip("weight.csv", csv);
const files = extractCsvFilesFromZip(zip);
assert.equal(files.length, 1);
assert.equal(files[0].name, "weight.csv");
assert.equal(files[0].text, csv);

assert.deepEqual(
  summarizeRows([
    { date: "2026-06-10" },
    { date: "2026-06-08" },
  ]),
  {
    rowCount: 2,
    dateRange: "2026-06-08 to 2026-06-10",
  },
);

assert.deepEqual(
  summarizeParsedFiles([
    {
      rows: duplicateDailyRows,
      warnings: [{ reason: "synthetic" }],
    },
  ]),
  {
    rowCount: 2,
    dateRange: "2026-06-10 to 2026-06-10",
    warningCount: 1,
    fileCount: 1,
    uniqueDailyMetricCount: 1,
  },
);

console.log("MedM portal sync helper tests passed.");

function syntheticZip(name, text) {
  const nameBytes = Buffer.from(name);
  const data = Buffer.from(text);
  const compressed = deflateRawSync(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBytes.length, 26);
  header.writeUInt16LE(0, 28);

  return Buffer.concat([header, nameBytes, compressed]);
}
