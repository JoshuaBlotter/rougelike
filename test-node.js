/*
 * Headless test runner (tooling — NOT part of the deliverable).
 *
 * Proves the sim/render separation is literally true: it extracts the <script>
 * from roguelike.html and runs it in a Node vm with NO document/window/canvas
 * present. The render+input block is guarded by `typeof document !== 'undefined'`
 * so it never executes here. If the sim secretly touched the DOM, this throws.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const htmlPath = path.join(__dirname, "roguelike.html");
const html = fs.readFileSync(htmlPath, "utf8");

// Pull the game <script> (the big one, no src attribute).
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const code = scripts.sort((a, b) => b.length - a.length)[0];
if (!code) { console.error("No <script> block found."); process.exit(1); }

// Run in a sandbox with only Node-ish globals. No document, no window, no
// canvas — the render block stays dormant. `performance` is provided so the
// generator's timing (generateReport) works headless without touching process.
const sandbox = { module: { exports: {} }, console, performance, globalThis: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "roguelike.html#script" });

const RL = sandbox.module.exports;
if (!RL || !RL.runTests) { console.error("Sim API not exported."); process.exit(1); }

// Feed the runner the raw source so Test 5 (grep Math.random) can inspect it.
RL.setSource(html);

const result = RL.runTests();
console.log(result.report);
process.exit(result.fail === 0 ? 0 : 1);
