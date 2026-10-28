import "dotenv/config";
import pg from "pg";

/** Every tool table must have RLS on, the audit trigger, at least one policy, and every column classified. */
const SKIP = ["platform", "app", "public", "neon_auth", "information_schema", "pg_catalog", "pg_toast"];

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const tables = (await c.query<{ s: string; t: string; rls: boolean; trig: boolean; policies: number }>(
    `select n.nspname s, c.relname t, c.relrowsecurity rls,
            exists (select 1 from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'audit_row_change') trig,
            (select count(*)::int from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname) policies
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname <> all($1) and n.nspname not like 'pg_%'`, [SKIP])).rows;
  const unclassified = (await c.query<{ s: string; t: string; col: string }>(
    `select table_schema s, table_name t, column_name col from information_schema.columns ic
     where table_schema <> all($1) and table_schema not like 'pg_%'
       and not exists (select 1 from platform.column_classification cc
         where cc.table_schema = ic.table_schema and cc.table_name = ic.table_name and cc.column_name = ic.column_name)`, [SKIP])).rows;
  const bypass = (await c.query<{ rolbypassrls: boolean }>("select rolbypassrls from pg_roles where rolname = 'app_rw'")).rows[0];
  await c.end();

  const errors: string[] = [];
  if (!bypass || bypass.rolbypassrls) errors.push("app_rw must exist and must not have BYPASSRLS");
  for (const t of tables) {
    if (!t.rls) errors.push(`${t.s}.${t.t}: row-level security is disabled`);
    if (!t.trig) errors.push(`${t.s}.${t.t}: missing audit_row_change trigger (use platform.secure_table)`);
    if (t.policies === 0) errors.push(`${t.s}.${t.t}: no RLS policies (default deny, so the tool can't read it)`);
  }
  for (const u of unclassified) errors.push(`${u.s}.${u.t}.${u.col}: column not classified (platform.classify)`);
  if (errors.length) {
    console.error(`check-rls failed:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`check-rls: ${tables.length} tool tables OK`);
}
main().catch((e) => { console.error(e); process.exit(1); });
