const fs = require('node:fs');
const path = require('node:path');
const { readDatabaseSections } = require('./database-sql.cjs');
const directory = path.resolve(__dirname, '../supabase');
const outputPath = path.join(directory, 'testing-database.sql');
const extra = fs.readdirSync(directory).filter(file => file.endsWith('.sql') && !['main-database.sql', 'testing-database.sql'].includes(file));
if (extra.length) throw new Error(`Keep SQL changes in main-database.sql, then regenerate testing: ${extra.join(', ')}`);
const sections = readDatabaseSections();
const header = `-- Generated from main-database.sql by node scripts/build-testing-database.cjs.
-- Repository-defined schema replica, NOT a live production export.
-- Run ONLY in a fresh Supabase testing project. No production data or users included.
-- Supabase supplies auth.users, auth.uid(), auth.jwt(), and platform roles.
-- The whole installation rolls back on failure.
begin;
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_type='BASE TABLE') then
    raise exception 'Testing setup requires a fresh public schema. Select an empty testing project.';
  end if;
end;
$$;
`;
const sql = header + sections.map(({ name, body }) => `\n-- ===== Section: ${name} =====\n${body}\n`).join('') + '\ncommit;\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== sql) {
    console.error('Testing database SQL is out of date. Run node scripts/build-testing-database.cjs.');
    process.exitCode = 1;
  } else console.log(`Testing database SQL matches all ${sections.length} main database sections.`);
} else {
  fs.writeFileSync(outputPath, sql);
  console.log(`Generated supabase/testing-database.sql from ${sections.length} main database sections.`);
}
