import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** Scaffolds a tool inside the console: code in apps/console/tools/<name>, pages at /t/<name>. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];

if (!name || !/^[a-z][a-z0-9-]{1,30}$/.test(name)) {
  console.error("usage: pnpm new-tool <name>   (lowercase letters, digits, dashes)");
  process.exit(1);
}
const consoleDir = join(root, "apps/console");
const moduleDest = join(consoleDir, "tools", name);
const routesDest = join(consoleDir, "app/t", name);
for (const d of [moduleDest, routesDest]) {
  if (existsSync(d)) {
    console.error(`${d.slice(root.length + 1)} already exists`);
    process.exit(1);
  }
}

const snake = name.replace(/-/g, "_");
const title = name.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const replacements: [RegExp, string][] = [
  [/__SCHEMA__/g, `tool_${snake}`],
  [/__TOOL__/g, name],
  [/__TITLE__/g, title],
];

const copy = (from: string, to: string) => {
  cpSync(join(root, "templates/tool", from), to, { recursive: true });
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else {
        let text = readFileSync(p, "utf8");
        for (const [re, v] of replacements) text = text.replace(re, v);
        writeFileSync(p, text);
      }
    }
  };
  walk(to);
};
copy("module", moduleDest);
copy("routes", routesDest);
renameSync(join(moduleDest, "db/migrations/0001_init.sql"), join(moduleDest, `db/migrations/0001_${snake}.sql`));

// Register with the console (tool catalog, nav, approval handlers)
const toolsFile = join(consoleDir, "lib/tools.ts");
const ident = snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
let tools = readFileSync(toolsFile, "utf8");
tools = `import { manifest as ${ident}Manifest } from "@/tools/${name}/manifest";\nimport { platform as ${ident}Platform } from "@/tools/${name}/lib/actions";\n` + tools;
tools = tools.replace("// new-tool:manifests", `${ident}Manifest,\n  // new-tool:manifests`).replace("// new-tool:platforms", `${JSON.stringify(name)}: ${ident}Platform,\n  // new-tool:platforms`);
writeFileSync(toolsFile, tools);

console.log(`\nCreated apps/console/tools/${name} and /t/${name}. Next:\n  pnpm db:migrate\n  pnpm --filter console dev   # http://localhost:3000/t/${name}\n  pnpm verify`);
