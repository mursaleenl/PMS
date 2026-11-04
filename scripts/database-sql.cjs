const fs = require('node:fs');
const path = require('node:path');
const mainPath = path.resolve(__dirname, '../supabase/main-database.sql');

function readDatabaseSections() {
  const sql = fs.readFileSync(mainPath, 'utf8');
  const markers = [...sql.matchAll(/^-- ===== Section: ([a-z0-9-]+) =====\r?$/gm)];
  if (!markers.length) throw new Error('The main database script has no named sections.');
  const names = new Set();
  return markers.map((marker, index) => {
    const name = marker[1];
    if (names.has(name)) throw new Error(`Duplicate database section: ${name}`);
    names.add(name);
    const end = markers[index + 1]?.index ?? sql.length;
    const body = sql.slice(marker.index + marker[0].length, end)
      .replace(/^\s*(?:begin|commit);\s*$/gmi, '').trim();
    return { name, body };
  });
}

function readDatabaseSection(name) {
  const section = readDatabaseSections().find(section => section.name === name);
  if (!section) throw new Error(`Unknown database section: ${name}`);
  return section.body;
}

module.exports = { readDatabaseSections, readDatabaseSection };
