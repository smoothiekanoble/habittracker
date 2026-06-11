#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizedUnit,
  parseMedmWeightCsv,
} from "./parse-medm-weight-csv.mjs";

const fixtureDir = join("scripts", "medm-health", "fixtures");

function readFixture(name) {
  return readFileSync(join(fixtureDir, name), "utf8");
}

function assertMetricShape(row) {
  assert.match(row.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(row.metric_type, "body_weight");
  assert.equal(row.source, "medm_health");
  assert.equal(typeof row.value, "number");
  assert.ok(["lb", "kg"].includes(row.unit));
  assert.ok(row.source_record_id || row.raw_hash);
}

const pounds = parseMedmWeightCsv(readFixture("synthetic-medm-weight.csv"));
assert.equal(pounds.warnings.length, 0);
assert.equal(pounds.rows.length, 4);
pounds.rows.forEach(assertMetricShape);
assert.equal(pounds.rows[0].unit, "lb");
assert.equal(pounds.rows[0].source_record_id, "medm-synth-001");
assert.equal(pounds.rows[2].unit, "kg");
assert.equal(pounds.rows[3].date, "2026-06-04");
assert.equal(pounds.rows[3].value, 81.9);

const kilograms = parseMedmWeightCsv(readFixture("synthetic-medm-weight-kg.csv"));
assert.equal(kilograms.warnings.length, 0);
assert.equal(kilograms.rows.length, 3);
kilograms.rows.forEach(assertMetricShape);
assert.deepEqual(
  kilograms.rows.map((row) => row.unit),
  ["kg", "kg", "kg"],
);
assert.equal(kilograms.rows[0].value, 81.7);
assert.ok(kilograms.rows[0].raw_hash);

const portal = parseMedmWeightCsv(
  readFixture("synthetic-medm-portal-weight-report.csv"),
);
assert.deepEqual(portal.header_names, [
  "Measurement Type",
  "Measured At",
  "Result",
  "Units",
  "Device Name",
  "Source",
]);
assert.equal(portal.warnings.length, 0);
assert.equal(portal.rows.length, 3);
portal.rows.forEach(assertMetricShape);
assert.equal(portal.rows[0].date, "2026-06-08");
assert.equal(portal.rows[0].unit, "lb");
assert.equal(portal.rows[2].unit, "kg");
assert.match(portal.rows[0].source_detail, /MedM Health Portal/);

const malformed = parseMedmWeightCsv(
  readFixture("synthetic-medm-weight-malformed.csv"),
);
assert.equal(malformed.rows.length, 1);
assert.equal(malformed.warnings.length, 3);
assert.match(malformed.warnings[0].reason, /date/);
assert.match(malformed.warnings[1].reason, /nonnumeric/);
assert.match(malformed.warnings[2].reason, /unit/);
assert.equal("row" in malformed.warnings[0], false);
assertMetricShape(malformed.rows[0]);

const duplicates = parseMedmWeightCsv(`Date,Weight,Unit
2026-06-12,180.1,lb
2026-06-12,180.1,lb
`);
assert.equal(duplicates.rows.length, 2);
assert.equal(duplicates.rows[0].raw_hash, duplicates.rows[1].raw_hash);

assert.equal(normalizedUnit("", "180 pounds", "Weight"), "lb");
assert.equal(normalizedUnit("", "81 kilograms", "Weight"), "kg");

console.log("MedM body-weight parser tests passed.");
