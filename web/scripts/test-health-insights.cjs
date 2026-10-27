// Calculation regression checks and a synthetic, offline render for visual QA.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/"))
    request = path.join(root, "src", request.slice(2));
  return originalResolve.call(this, request, ...args);
};
for (const extension of [".ts", ".tsx"]) {
  require.extensions[extension] = (module, filename) => {
    const { outputText } = ts.transpileModule(
      fs.readFileSync(filename, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2020,
          esModuleInterop: true,
        },
        fileName: filename,
      },
    );
    module._compile(outputText, filename);
  };
}
const h = require("../src/lib/health-insights.ts");
const base = {
  id: "1",
  metric_date: "2026-10-01",
  metric_type: "body_weight",
  value: 100,
  unit: "kg",
  source: "medm_health",
  updated_at: "2026-10-01T12:00:00Z",
};
const dates = h.calendar("2026-10-01", "2026-10-03");
assert.equal(dates.length, 3);
assert.equal(h.shiftDay("2026-03-08", 1), "2026-03-09");
const weight = h.metricSeries([base], "body_weight", dates, "lb");
assert.ok(Math.abs(weight[0].value - 220.46226218) < 0.0001);
assert.equal(
  weight[1].value,
  null,
  "Missing days must remain gaps, not zeroes",
);
assert.equal(
  h.metricSeries(
    [{ ...base, value: 220.46226218, unit: "lb" }],
    "body_weight",
    dates,
    "kg",
  )[0].value,
  100,
);
const duplicates = [
  base,
  { ...base, id: "2", source: "other", value: 999, updated_at: "2026-10-02" },
  { ...base, id: "3", value: 101, updated_at: "2026-10-01T14:00:00Z" },
];
assert.equal(
  h.metricSeries(duplicates, "body_weight", dates, "kg")[0].value,
  101,
  "Prefer MedM and latest update; never arbitrary row order",
);
assert.equal(
  h.metricSeries([...duplicates].reverse(), "body_weight", dates, "kg")[0]
    .value,
  101,
);
assert.equal(
  h.metricSeries([{ ...base, unit: "stone" }], "body_weight", dates, "kg")[0]
    .value,
  null,
);
assert.equal(h.displayValue(479.9, "minutes"), "8h 0m");
const sparse = dates.map((date, i) => ({ date, value: i === 1 ? null : 100 }));
assert.equal(
  h.rollingMean(sparse)[2].value,
  null,
  "Require three readings for a rolling mean",
);
assert.equal(
  h.rollingMean([...sparse, { date: "2026-10-04", value: 130 }])[3].value,
  110,
);
assert.equal(
  h.metricSeries(
    [{ ...base, metric_type: "sleep_score", unit: "score", value: 200 }],
    "sleep_score",
    dates,
    "kg",
  )[0].value,
  null,
);
console.log(
  "Health calculations: unit conversion, gaps, provider precedence, calendar windows, rolling averages and invalid values passed.",
);

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const {
  InsightsDashboard,
} = require("../src/components/HealthInsightsPage.tsx");
for (const [props, expected] of [
  [{ rows: [] }, "Your dashboard is ready"],
  [{ rows: [], loading: true }, "Loading dashboard"],
  [{ rows: [], error: "Test request failed" }, "Test request failed"],
]) {
  assert.ok(
    renderToStaticMarkup(
      React.createElement(InsightsDashboard, {
        ...props,
        onRefresh() {},
        preferenceKey: null,
      }),
    ).includes(expected),
  );
}
const today = h.dateKey(new Date());
const fixtureDates = h.calendar(h.shiftDay(today, -214), today);
const rows = fixtureDates.flatMap((date, i) => {
  if (i % 19 === 3) return [];
  const sleep = 430 + Math.sin(i * 0.9) * 52 + Math.cos(i * 0.2) * 20;
  return Object.entries({
    sleep_minutes: sleep,
    sleep_score: 76 + Math.sin(i * 0.7) * 12,
    deep_sleep_minutes: sleep * 0.2,
    light_sleep_minutes: sleep * 0.55,
    rem_sleep_minutes: sleep * 0.25,
    awake_minutes: 12 + Math.abs(Math.sin(i)) * 25,
    avg_sleep_hr: 53 + Math.sin(i * 0.3) * 4,
    avg_sleep_stress: 19 + Math.sin(i * 0.5) * 5,
    resting_hr: 55 + Math.sin(i * 0.3) * 4,
    daily_stress: 28 + Math.sin(i * 0.4) * 7,
    steps: 7000 + Math.round(Math.sin(i * 0.6) * 1800),
    calories_burned: 2400 + Math.round(Math.sin(i * 0.7) * 350),
    active_calories_burned: 700 + Math.round(Math.sin(i * 0.8) * 180),
    ...(i % 3 === 0
      ? {}
      : { body_weight: 181 + i * 0.015 + Math.sin(i * 0.8) * 1.2 }),
  }).map(([type, value]) => ({
    ...base,
    id: `${date}:${type}`,
    metric_date: date,
    metric_type: type,
    source: type === "body_weight" ? "medm_health" : "garmin",
    unit:
      type === "body_weight"
        ? "lb"
        : type.includes("hr")
          ? "bpm"
          : type.includes("calories")
            ? "kcal"
            : type === "steps"
              ? "steps"
              : type.includes("score") || type.includes("stress")
                ? "score"
                : "minutes",
    value,
    updated_at: `${date}T12:00:00Z`,
  }));
});
const markup = renderToStaticMarkup(
  React.createElement(InsightsDashboard, {
    rows,
    onRefresh() {},
    preferenceKey: null,
  }),
);
assert.ok(markup.includes("The long game"));
assert.ok(markup.includes("Sleep architecture"));
assert.ok(
  (markup.match(/<svg/g) ?? []).length >= 8,
  "Data-backed chart modules should render",
);
const preview = path.resolve(root, "../local-data/dashboard-preview");
fs.mkdirSync(preview, { recursive: true });
fs.writeFileSync(
  path.join(preview, "index.html"),
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dashboard QA · synthetic data</title><link rel="stylesheet" href="dashboard.css"></head><body>${markup}</body></html>`,
);
console.log(`Synthetic dashboard rendered to ${preview}`);

if (process.argv.includes("--browser")) {
  const webpackBundle = require("next/dist/compiled/webpack/webpack");
  webpackBundle.init();
  const webpack = webpackBundle.webpack;
  fs.writeFileSync(
    path.join(preview, "entry.jsx"),
    `import React from 'react'; import {createRoot} from 'react-dom/client'; import {InsightsDashboard} from ${JSON.stringify(path.join(root, "src/components/HealthInsightsPage.tsx"))}; createRoot(document.querySelector('main').parentNode).render(React.createElement(InsightsDashboard,{rows:${JSON.stringify(rows)},onRefresh(){},preferenceKey:'dashboard-qa'}));`,
  );
  fs.appendFileSync(
    path.join(preview, "index.html"),
    '<script src="preview.js"></script>',
  );
  webpack(
    {
      mode: "development",
      devtool: false,
      context: root,
      entry: path.join(preview, "entry.jsx"),
      output: { path: preview, filename: "preview.js" },
      resolve: {
        extensions: [".tsx", ".ts", ".jsx", ".js"],
        alias: { "@": path.join(root, "src") },
        modules: [path.join(root, "node_modules"), "node_modules"],
      },
      module: {
        rules: [
          {
            test: /\.[jt]sx?$/,
            exclude: /node_modules/,
            use: path.join(__dirname, "health-preview-loader.cjs"),
          },
        ],
      },
    },
    async (error, stats) => {
      if (error || stats.hasErrors()) {
        console.error(error || stats.toString({ all: false, errors: true }));
        process.exitCode = 1;
        return;
      }
      const { chromium } = require("playwright");
      const http = require("node:http");
      const server = http.createServer((req, res) => {
        const name =
          req.url === "/preview.js"
            ? "preview.js"
            : req.url === "/dashboard.css"
              ? "dashboard.css"
              : "index.html";
        res.setHeader(
          "Content-Type",
          name.endsWith(".js")
            ? "text/javascript"
            : name.endsWith(".css")
              ? "text/css"
              : "text/html",
        );
        res.end(fs.readFileSync(path.join(preview, name)));
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      let browser;
      try {
        browser = await chromium.launch({
          headless: true,
          ...(process.env.PLAYWRIGHT_CHANNEL
            ? { channel: process.env.PLAYWRIGHT_CHANNEL }
            : {}),
        });
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1050 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page
          .getByRole("button", { name: "Customize", exact: true })
          .click();
        await page
          .getByRole("checkbox", { name: "Sleep architecture", exact: true })
          .uncheck();
        assert.equal(
          await page
            .getByRole("heading", { name: "Sleep architecture", exact: true })
            .count(),
          0,
        );
        await page
          .getByRole("button", {
            name: "Move Body weight earlier",
            exact: true,
          })
          .click();
        assert.equal(
          await page.locator("article h2").first().textContent(),
          "Body weight",
        );
        await page
          .getByRole("button", { name: "Done editing", exact: true })
          .click();
        await page.reload();
        await page.waitForFunction(
          () =>
            document.querySelector("article h2")?.textContent === "Body weight",
        );
        assert.equal(
          await page
            .getByRole("heading", { name: "Sleep architecture", exact: true })
            .count(),
          0,
          "Hidden modules persist after reload",
        );
        await page
          .getByRole("button", { name: "All history", exact: true })
          .click();
        assert.equal(
          await page
            .getByRole("button", { name: "All history", exact: true })
            .getAttribute("aria-pressed"),
          "true",
        );
        assert.ok(
          (await page.locator("article").first().textContent()).includes(
            "Body weight",
          ),
        );
        await page
          .getByRole("button", { name: "Customize", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Reset layout", exact: true })
          .click();
        await page
          .getByRole("checkbox", { name: "Bar charts", exact: true })
          .check();
        assert.ok(
          (await page.locator("article").first().locator("svg rect").count()) >
            0,
        );
        await page
          .getByRole("checkbox", { name: "Bar charts", exact: true })
          .uncheck();
        await page
          .getByRole("button", { name: "Done editing", exact: true })
          .click();
        assert.equal(
          await page.locator("article h2").first().textContent(),
          "Sleep duration",
        );
        await page
          .getByRole("button", { name: "View readings", exact: true })
          .click();
        assert.ok((await page.locator("table").count()) >= 2);
        await page
          .getByRole("button", { name: "Hide readings", exact: true })
          .click();
        const firstChart = page.locator("article svg").first();
        assert.ok(
          (await firstChart.boundingBox()).height > 120,
          "Chart must have visible height",
        );
        await firstChart.hover();
        await page.screenshot({
          path: path.join(preview, "desktop.png"),
          fullPage: true,
        });
        for (const width of [390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          assert.ok(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            `No page overflow at ${width}px`,
          );
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: path.join(preview, "mobile.png"),
          fullPage: true,
        });
        assert.deepEqual(errors, [], "No browser runtime errors");
        console.log(
          "Browser checks passed: module visibility/order persistence, date ranges, readings, chart height and 390/768/1440px layouts.",
        );
      } catch (error) {
        console.error(error);
        process.exitCode = 1;
      } finally {
        if (browser) await browser.close();
        server.close();
      }
    },
  );
}
