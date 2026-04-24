require('dotenv').config();
const pool = require('../src/db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

      CREATE TABLE IF NOT EXISTS profiles (
        id            VARCHAR(36)   PRIMARY KEY,
        name          VARCHAR(255)  NOT NULL UNIQUE,
        gender        VARCHAR(10)   NOT NULL,
        gender_probability  FLOAT   NOT NULL,
        age           INT           NOT NULL,
        age_group     VARCHAR(20)   NOT NULL,
        country_id    VARCHAR(2)    NOT NULL,
        country_name  VARCHAR(255)  NOT NULL,
        country_probability  FLOAT  NOT NULL,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_profiles_gender        ON profiles(gender);
      CREATE INDEX IF NOT EXISTS idx_profiles_age_group     ON profiles(age_group);
      CREATE INDEX IF NOT EXISTS idx_profiles_country_id    ON profiles(country_id);
      CREATE INDEX IF NOT EXISTS idx_profiles_age           ON profiles(age);
      CREATE INDEX IF NOT EXISTS idx_profiles_created_at    ON profiles(created_at);
      CREATE INDEX IF NOT EXISTS idx_profiles_gender_prob   ON profiles(gender_probability);
      CREATE INDEX IF NOT EXISTS idx_profiles_country_prob  ON profiles(country_probability);
    `);
    console.log('Migration complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);