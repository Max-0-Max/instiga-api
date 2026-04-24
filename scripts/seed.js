require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

// UUID v7 generator (time-ordered)
function uuidv7() {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  const rand1 = Math.floor(Math.random() * 0x0fff).toString(16).padStart(3, '0');
  const rand2 = Math.floor(Math.random() * 0x3fff + 0x8000).toString(16).padStart(4, '0');
  const rand3 = Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0');
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8)}-7${rand1}-${rand2}-${rand3}`;
}

function getAgeGroup(age) {
  if (age < 13) return 'child';
  if (age < 20) return 'teenager';
  if (age < 65) return 'adult';
  return 'senior';
}

async function seed() {
  const dataPath = process.argv[2] || path.join(__dirname, '../data/profiles.json');

  if (!fs.existsSync(dataPath)) {
    console.error(`Data file not found at: ${dataPath}`);
    console.error('Usage: node scripts/seed.js [path/to/profiles.json]');
    process.exit(1);
  }

  const raw = fs.readFileSync(dataPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const profiles = Array.isArray(parsed) ? parsed : parsed.profiles;

  console.log(`Seeding ${profiles.length} profiles...`);

  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;

    for (const p of profiles) {
      const age = p.age?.value ?? p.age ?? 0;
      const ageGroup = p.age_group ?? getAgeGroup(age);
      const genderVal = p.gender?.value ?? p.gender ?? 'male';
      const genderProb = p.gender?.probability ?? p.gender_probability ?? 0.5;
      const countryId = p.nationality?.country_id ?? p.country_id ?? 'NG';
      const countryName = p.nationality?.country_name ?? p.country_name ?? 'Unknown';
      const countryProb = p.nationality?.probability ?? p.country_probability ?? 0.5;
      const name = p.name ?? p.full_name ?? 'unknown';

      const result = await client.query(
        `INSERT INTO profiles
          (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (name) DO NOTHING
         RETURNING id`,
        [uuidv7(), name, genderVal, genderProb, age, ageGroup, countryId, countryName, countryProb]
      );

      if (result.rowCount > 0) inserted++;
      else skipped++;
    }

    console.log(`Done. Inserted: ${inserted}, Skipped (duplicates): ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);