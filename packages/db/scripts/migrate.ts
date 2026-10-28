import "dotenv/config";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { syncRolePermissions } from "./sync-permissions";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function ownerUrl(): string {
  const url = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (owner role) to run migrations");
  return url;
}

function migrationDirs(): { app: string; dir: string }[] {
  const dirs = [{ app: "platform", dir: join(root, "packages/db/migrations") }];
  const appsDir = join(root, "apps");
  for (const app of readdirSync(appsDir).sort()) {
    const dir = join(appsDir, app, "db/migrations");
    if (existsSync(dir)) dirs.push({ app, dir });
  }
  const toolsDir = join(root, "apps/console/tools");
  if (existsSync(toolsDir)) {
    for (const tool of readdirSync(toolsDir).sort()) {
      const dir = join(toolsDir, tool, "db/migrations");
      if (existsSync(dir)) dirs.push({ app: tool, dir });
    }
  }
  return dirs;
}

export async function migrate(connectionString = ownerUrl()): Promise<void> {
  const password = process.env.APP_DB_PASSWORD;
  if (!password) throw new Error("Set APP_DB_PASSWORD (password for the app_rw role)");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const exists = await client.query("select 1 from pg_roles where rolname = 'app_rw'");
    const verb = exists.rowCount ? "alter" : "create";
    await client.query(`${verb} role app_rw with login nobypassrls password '${password.replace(/'/g, "''")}'`);
    await client.query(`create table if not exists public._platform_migrations (
      name text primary key, applied_at timestamptz not null default now())`);
    const applied = new Set(
      (await client.query<{ name: string }>("select name from public._platform_migrations")).rows.map((r) => r.name),
    );
    for (const { app, dir } of migrationDirs()) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
        const name = `${app}/${file}`;
        if (applied.has(name)) continue;
        await client.query("begin");
        try {
          await client.query(readFileSync(join(dir, file), "utf8"));
          await client.query("insert into public._platform_migrations (name) values ($1)", [name]);
          await client.query("commit");
          console.log(`applied ${name}`);
        } catch (err) {
          await client.query("rollback");
          throw new Error(`migration ${name} failed: ${(err as Error).message}`);
        }
      }
    }
    await syncRolePermissions(client);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  migrate().then(
    () => console.log("migrations complete"),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
