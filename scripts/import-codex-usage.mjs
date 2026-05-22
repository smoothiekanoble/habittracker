import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_DASHBOARD_URL = "https://chatgpt.com/codex/settings/usage";
const DEFAULT_PORT = 9333;
const DEBUG_DIR = join("scripts", "codex-usage-debug");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const fileEnv = readEnvFile(join("scripts", "codex-usage.env"));
const env = { ...fileEnv, ...process.env };
const CODEX_HOME = env.CODEX_HOME?.trim() || join(homedir(), ".codex");

function required(name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}. Copy scripts/codex-usage.env.example to scripts/codex-usage.env.`);
  return value;
}

function chromePath() {
  const candidates = [
    env.CODEX_USAGE_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error("Could not find Chrome or Edge. Set CODEX_USAGE_CHROME_PATH in scripts/codex-usage.env.");
  }
  return found;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function writeDebugFile(name, value) {
  mkdirSync(DEBUG_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(DEBUG_DIR, `${timestamp}-${name}`);
  writeFileSync(path, value, "utf8");
  return path;
}

function writeLatestDebugFile(name, value) {
  mkdirSync(DEBUG_DIR, { recursive: true });
  const path = join(DEBUG_DIR, name);
  writeFileSync(path, value, "utf8");
  return path;
}

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitForPage(port, dashboardUrl) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
      const page =
        pages.find((entry) => entry.type === "page" && entry.url.startsWith(dashboardUrl)) ??
        pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      // Chrome may still be starting.
    }
    await sleep(500);
  }
  throw new Error("Timed out waiting for Chrome debug target.");
}

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async ready() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.socket.send(payload);
    return promise;
  }

  close() {
    this.socket.close();
  }
}

function numberFrom(value) {
  if (!value) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function nearbyLines(lines, predicate) {
  const matches = [];
  lines.forEach((line, index) => {
    if (!predicate(line)) return;
    const start = Math.max(0, index - 2);
    const end = Math.min(lines.length, index + 3);
    matches.push(lines.slice(start, end).join(" "));
  });
  return matches;
}

function extractPercent(lines, predicate) {
  for (const block of nearbyLines(lines, predicate)) {
    if (/%\s*(?:remaining|left|available)/i.test(block)) continue;
    const percent = block.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percent) return numberFrom(percent[1]);
    const usedOf = block.match(/(\d+(?:\.\d+)?)\s*(?:of|\/)\s*(\d+(?:\.\d+)?)/i);
    if (usedOf) {
      const used = numberFrom(usedOf[1]);
      const total = numberFrom(usedOf[2]);
      if (used !== null && total) return Math.min(100, (used / total) * 100);
    }
  }
  return null;
}

function extractRemainingPercent(lines, predicate) {
  for (const block of nearbyLines(lines, predicate)) {
    const remainingOf = block.match(/(\d+(?:\.\d+)?)\s*(?:of|\/)\s*(\d+(?:\.\d+)?)\s*(?:remaining|left|available)/i);
    if (remainingOf) {
      const remaining = numberFrom(remainingOf[1]);
      const total = numberFrom(remainingOf[2]);
      if (remaining !== null && total) return Math.max(0, Math.min(100, 100 - (remaining / total) * 100));
    }
    const remainingPercent = block.match(/(\d+(?:\.\d+)?)\s*%\s*(?:remaining|left|available)/i);
    if (remainingPercent) {
      const remaining = numberFrom(remainingPercent[1]);
      if (remaining !== null) return Math.max(0, Math.min(100, 100 - remaining));
    }
  }
  return null;
}

function extractCreditBalance(lines) {
  for (const block of nearbyLines(lines, (line) => /credits?\s+(?:remaining|balance)/i.test(line))) {
    const explicit = block.match(/credits?\s+(?:remaining|balance)\s+(\d[\d,]*(?:\.\d+)?)/i);
    if (explicit) return numberFrom(explicit[1]);
  }
  for (const block of nearbyLines(lines, (line) => /(?:remaining|balance)/i.test(line))) {
    const explicit = block.match(/(?:remaining|balance)\s+credits?\s+(\d[\d,]*(?:\.\d+)?)/i);
    if (explicit) return numberFrom(explicit[1]);
  }
  return null;
}

function normalizeLines(text, extraLines = []) {
  return [...text.split(/\r?\n/), ...extraLines]
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseUsageSnapshot(snapshot) {
  const text = snapshot.text ?? "";
  const extraLines = [
    ...(snapshot.ariaLabels ?? []),
    ...(snapshot.titles ?? []),
    ...(snapshot.inputValues ?? []),
    ...(snapshot.meterValues ?? []).map((meter) =>
      [meter.label, meter.value, meter.max, meter.now, meter.text].filter(Boolean).join(" ")
    ),
  ];
  const lines = normalizeLines(text, extraLines);
  const loginLikely = /log in|sign in|continue with google|continue with microsoft/i.test(text);
  if (loginLikely) {
    throw new Error("Codex dashboard appears to require login in the importer browser profile.");
  }

  const creditBalance = extractCreditBalance(lines);
  const fiveHourPredicate = (line) =>
    /(5|five)[-\s]?hour|hour/i.test(line) && /limit|usage|used|remaining|left|available|window/i.test(line);
  const weeklyPredicate = (line) =>
    /week|weekly/i.test(line) && /limit|usage|used|remaining|left|available/i.test(line);
  const fiveHourUsedPercent =
    extractRemainingPercent(lines, fiveHourPredicate) ?? extractPercent(lines, fiveHourPredicate);
  const weeklyUsedPercent =
    extractRemainingPercent(lines, weeklyPredicate) ?? extractPercent(lines, weeklyPredicate);

  if (creditBalance === null && fiveHourUsedPercent === null && weeklyUsedPercent === null) {
    const path = writeDebugFile("dashboard-snapshot.json", JSON.stringify(snapshot, null, 2));
    throw new Error(
      `Could not find credit balance, 5-hour usage, or weekly usage in dashboard text. Debug dump: ${path}`
    );
  }

  return {
    credit_balance: creditBalance,
    five_hour_used_percent: fiveHourUsedPercent,
    weekly_used_percent: weeklyUsedPercent,
    raw_metrics: {
      matched_lines: lines.filter((line) => /credit|5|five|hour|week|weekly|limit|usage|used|remaining/i.test(line)),
      captured_text_excerpt: text.slice(0, 4000),
      meter_values: snapshot.meterValues,
    },
  };
}

async function insertSnapshot(snapshot) {
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const userId = required("CODEX_USAGE_USER_ID");
  const response = await fetch(`${supabaseUrl}/rest/v1/codex_usage_snapshots`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ user_id: userId, source: "codex_usage_dashboard", ...snapshot }),
  });
  if (!response.ok) {
    throw new Error(`Supabase insert failed: ${response.status} ${await response.text()}`);
  }
}

async function upsertDailyStats(stats) {
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const userId = required("CODEX_USAGE_USER_ID");
  const response = await fetch(
    `${supabaseUrl}/rest/v1/codex_daily_usage_stats?on_conflict=user_id,date`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ user_id: userId, ...stats }),
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase daily stats upsert failed: ${response.status} ${await response.text()}`);
  }
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function collectJsonlFiles(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) collectJsonlFiles(path, files);
    else if (entry.endsWith(".jsonl")) files.push(path);
  }
  return files;
}

function isUserTurn(item) {
  const payload = item.payload ?? {};
  if (item.type === "response_item" && payload.type === "message" && payload.role === "user") {
    return true;
  }
  return false;
}

function readLocalDailyActivity() {
  const day = localDateKey(new Date());
  const sessionsDir = join(CODEX_HOME, "sessions");
  const files = collectJsonlFiles(sessionsDir);
  const threadIds = new Set();
  let localTurnCount = 0;

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    let threadId = null;
    let fileTurnsToday = 0;
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        continue;
      }
      if (item.type === "session_meta" && item.payload?.id && !threadId) {
        threadId = item.payload.id;
      }
      if (item.timestamp && localDateKey(new Date(item.timestamp)) === day && isUserTurn(item)) {
        fileTurnsToday += 1;
      }
    }
    if (fileTurnsToday > 0) {
      localTurnCount += fileTurnsToday;
      threadIds.add(threadId ?? file);
    }
  }

  return {
    date: day,
    local_thread_count: threadIds.size,
    local_turn_count: localTurnCount,
  };
}

async function readExistingDailyStats(date) {
  const supabaseUrl = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL.");
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const userId = required("CODEX_USAGE_USER_ID");
  const params = new URLSearchParams({
    select: "max_five_hour_used_percent,max_weekly_used_percent,sample_count",
    user_id: `eq.${userId}`,
    date: `eq.${date}`,
    limit: "1",
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/codex_daily_usage_stats?${params.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase daily stats read failed: ${response.status} ${await response.text()}`);
  }
  const rows = await response.json();
  return rows[0] ?? null;
}

async function writeDailyStats({ status, metrics = null, errorMessage = null }) {
  const activity = readLocalDailyActivity();
  const existing = await readExistingDailyStats(activity.date);
  await upsertDailyStats({
    ...activity,
    max_five_hour_used_percent: Math.max(
      Number(existing?.max_five_hour_used_percent ?? 0),
      Number(metrics?.five_hour_used_percent ?? 0)
    ),
    max_weekly_used_percent: Math.max(
      Number(existing?.max_weekly_used_percent ?? 0),
      Number(metrics?.weekly_used_percent ?? 0)
    ),
    sample_count: Number(existing?.sample_count ?? 0) + 1,
    last_captured_at: new Date().toISOString(),
    status,
    error_message: errorMessage,
    updated_at: new Date().toISOString(),
  });
}

async function captureDashboard() {
  const port = Number(env.CODEX_USAGE_REMOTE_DEBUGGING_PORT || DEFAULT_PORT);
  const dashboardUrl = env.CODEX_USAGE_DASHBOARD_URL || DEFAULT_DASHBOARD_URL;
  const profileDir =
    env.CODEX_USAGE_CHROME_PROFILE_DIR ||
    join(homedir(), ".codex-habittracker-codex-usage-chrome");
  mkdirSync(dirname(profileDir), { recursive: true });
  mkdirSync(profileDir, { recursive: true });

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    dashboardUrl,
  ];
  if (env.CODEX_USAGE_HEADLESS === "1") args.unshift("--headless=new");

  const chrome = spawn(chromePath(), args, { stdio: "ignore", detached: true });
  chrome.unref();

  const page = await waitForPage(port, dashboardUrl);
  const cdp = new CdpClient(page.webSocketDebuggerUrl);
  await cdp.ready();
  try {
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await sleep(8_000);
    const result = await cdp.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body ? document.body.innerText : "";
        const ariaLabels = Array.from(document.querySelectorAll("[aria-label]"))
          .map((el) => el.getAttribute("aria-label"))
          .filter(Boolean);
        const titles = Array.from(document.querySelectorAll("[title]"))
          .map((el) => el.getAttribute("title"))
          .filter(Boolean);
        const inputValues = Array.from(document.querySelectorAll("input, textarea"))
          .map((el) => [el.name, el.placeholder, el.value].filter(Boolean).join(" "))
          .filter(Boolean);
        const meterValues = Array.from(document.querySelectorAll("meter, progress, [role='progressbar'], [aria-valuenow], [aria-valuetext]"))
          .map((el) => ({
            label: el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || "",
            text: el.innerText || el.textContent || "",
            value: el.getAttribute("value") || "",
            max: el.getAttribute("max") || "",
            now: el.getAttribute("aria-valuenow") || "",
            min: el.getAttribute("aria-valuemin") || "",
            valueText: el.getAttribute("aria-valuetext") || "",
            className: el.getAttribute("class") || "",
          }));
        return { url: location.href, title: document.title, text, ariaLabels, titles, inputValues, meterValues };
      })()`,
      returnByValue: true,
    });
    return result.result?.value ?? {};
  } finally {
    cdp.close();
  }
}

async function main() {
  try {
    const snapshot = await captureDashboard();
    const debugPath = writeLatestDebugFile(
      "latest-dashboard-snapshot.json",
      JSON.stringify(snapshot, null, 2)
    );
    console.log(`Captured dashboard snapshot: ${debugPath}`);
    const metrics = parseUsageSnapshot(snapshot);
    await insertSnapshot({ status: "ok", error_message: null, ...metrics });
    await writeDailyStats({ status: "ok", metrics });
    console.log("Inserted Codex usage snapshot.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await insertSnapshot({
        status: "error",
        error_message: message,
        raw_metrics: { error: message },
      });
      await writeDailyStats({ status: "error", errorMessage: message });
    } catch (insertError) {
      const insertMessage =
        insertError instanceof Error ? insertError.message : String(insertError);
      console.error(`Could not insert error snapshot: ${insertMessage}`);
    }
    console.error(message);
    process.exitCode = 1;
  }
}

main();
