#!/usr/bin/env node
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import {
  EMAIL_LOGIN_SELECTORS,
  LOGIN_PATHS,
  PASSWORD_SELECTORS,
  extractCsvFilesFromZip,
  findReportLinks,
  localBackfillWindow,
  parseArgs,
  sanitizeHtmlForDebug,
  summarizeRows,
} from "./sync-medm-portal.mjs";

const args = parseArgs(["--days", "14", "--headless", "false"]);
assert.equal(args.days, 14);
assert.equal(args.headless, false);
assert.throws(() => parseArgs(["--days", "0"]), /--days/);

assert.equal(LOGIN_PATHS[0], "/en/user/login");
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[type="text"]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[name*="login" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[name*="username" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[id*="login" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[id*="username" i]'));
assert.ok(EMAIL_LOGIN_SELECTORS.includes('input[autocomplete="username"]'));
assert.ok(PASSWORD_SELECTORS.includes('input[name*="password" i]'));
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
