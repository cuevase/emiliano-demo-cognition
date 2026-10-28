import { cpSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2];
const noInstall = process.argv.includes("--no-install");

if (!name || !/^[a-z][a-z0-9-]{1,30}$/.test(name)) {
  console.error("usage: pnpm new-tool <name>   (lowercase letters, digits, dashes)");
  process.exit(1);
}
const dest = join(root, "apps", name);
if (existsSync(dest)) {
  console.error(`apps/${name} already exists`);
  process.exit(1);
}

const snake = name.replace(/-/g, "_");
const title = name.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ");
const port = 3100 + readdirSync(join(root, "apps")).length;
const replacements: [RegExp, string][] = [
  [/__SCHEMA__/g, `tool_${snake}`],
  [/__TOOL__/g, name],
  [/__TITLE__/g, title],
  [/__PORT__/g, String(port)],
];

cpSync(join(root, "templates/tool"), dest, { recursive: true, filter: (src) => !/node_modules|\.next/.test(src) });
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
walk(dest);
renameSync(join(dest, "db/migrations/0001_init.sql"), join(dest, `db/migrations/0001_${snake}.sql`));

// Register with the console (tool catalog + approval handlers)
const consolePkg = join(root, "apps/console/package.json");
const pkg = JSON.parse(readFileSync(consolePkg, "utf8"));
pkg.dependencies[name] = "workspace:*";
writeFileSync(consolePkg, JSON.stringify(pkg, null, 2) + "\n");
const toolsFile = join(root, "apps/console/lib/tools.ts");
const ident = snake.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
let tools = readFileSync(toolsFile, "utf8");
tools = `import { manifest as ${ident}Manifest } from "${name}/manifest";\nimport { platform as ${ident}Platform } from "${name}/actions";\n` + tools;
tools = tools.replace("// new-tool:manifests", `${ident}Manifest,\n  // new-tool:manifests`).replace("// new-tool:platforms", `${JSON.stringify(name)}: ${ident}Platform,\n  // new-tool:platforms`);
writeFileSync(toolsFile, tools);

if (!noInstall) execSync("pnpm install --no-frozen-lockfile", { cwd: root, stdio: "inherit" });
console.log(`\nCreated apps/${name} (port ${port}). Next:\n  pnpm db:migrate\n  pnpm --filter ${name} dev\n  pnpm verify`);
