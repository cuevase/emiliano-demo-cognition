import "dotenv/config";
import pg from "pg";
import { migrate } from "../packages/db/scripts/migrate";

/** Creates a fresh `<db>_test` database, migrates it, and points tests at it. */
export default async function setup() {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/postgres";
  const url = new URL(base);
  const name = `${url.pathname.slice(1) || "platform"}_test`.replace(/(_test)+$/, "_test");
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();
  process.env.APP_DB_PASSWORD ??= "app_rw_test_password";
  delete process.env.APP_DATABASE_URL;
  await migrate(url.toString());
}
