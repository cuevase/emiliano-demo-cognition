import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Platform } from "@platform/actions/core";
import type { ToolManifest } from "@platform/permissions";

/**
 * Permission coverage: every tool action declares a known permission, every declared
 * permission is used, and every action name appears in the tool's tests in both an
 * allowed and a denied case.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors: string[] = [];
let count = 0;

for (const app of readdirSync(join(root, "apps")).sort()) {
  const dir = join(root, "apps", app);
  if (!existsSync(join(dir, "manifest.ts"))) continue;
  const { manifest } = (await import(pathToFileURL(join(dir, "manifest.ts")).href)) as { manifest: ToolManifest };
  const { platform } = (await import(pathToFileURL(join(dir, "lib/actions.ts")).href)) as { platform: Platform };
  const testDir = join(dir, "tests");
  const tests = existsSync(testDir) ? readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).map((f) => readFileSync(join(testDir, f), "utf8")).join("\n") : "";

  const used = new Set<string>();
  for (const a of platform.actions) {
    count++;
    used.add(a.permission);
    if (a.approval) used.add(a.approval.approverPermission);
    const block = tests.split(/describe\(/).find((b) => b.includes(`"${a.name}"`) || b.includes(`'${a.name}'`));
    if (!block) errors.push(`${app}: action ${a.name} has no describe("${a.name}") block in tests/`);
    else {
      if (!/allows|allowed/i.test(block)) errors.push(`${app}: ${a.name} has no allowed-case test`);
      if (!/denies|denied|forbidden/i.test(block)) errors.push(`${app}: ${a.name} has no denied-case test`);
    }
  }
  for (const p of Object.keys(manifest.permissions)) {
    if (!used.has(p) && !p.endsWith(":read") && !p.endsWith(".read")) errors.push(`${app}: permission ${p} is declared but no action uses it`);
  }
  const src = readFileSync(join(dir, "lib/actions.ts"), "utf8");
  if (/\.(insert|update|delete)\(/.test(src.replace(/handler:[\s\S]*?\n {2}\},?\n\}\);/g, "")) && !src.includes("defineAction")) {
    errors.push(`${app}: lib/actions.ts writes outside defineAction`);
  }
}

if (errors.length) {
  console.error(`check-permissions failed:\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
console.log(`check-permissions: ${count} actions covered`);
