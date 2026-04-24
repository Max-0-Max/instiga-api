require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ─── Natural Language Parser ───────────────────────────────────────────────

const COUNTRY_MAP = {
  nigeria: 'NG', ghana: 'GH', kenya: 'KE', angola: 'AO', tanzania: 'TZ',
  ethiopia: 'ET', uganda: 'UG', senegal: 'SN', cameroon: 'CM', benin: 'BJ',
  togo: 'TG', mali: 'ML', niger: 'NE', chad: 'TD', sudan: 'SD',
  egypt: 'EG', morocco: 'MA', algeria: 'DZ', tunisia: 'TN', libya: 'LY',
  'south africa': 'ZA', zimbabwe: 'ZW', zambia: 'ZM', mozambique: 'MZ',
  madagascar: 'MG', rwanda: 'RW', burundi: 'BI', somalia: 'SO',
  'ivory coast': 'CI', "cote d'ivoire": 'CI', liberia: 'LR',
  'sierra leone': 'SL', guinea: 'GN', 'burkina faso': 'BF',
  'democratic republic of congo': 'CD', congo: 'CG', gabon: 'GA',
  namibia: 'NA', botswana: 'BW', malawi: 'MW', lesotho: 'LS',
  swaziland: 'SZ', eswatini: 'SZ', eritrea: 'ER', djibouti: 'DJ',
};

function parseNaturalLanguage(q) {
  const query = q.toLowerCase().trim();
  const filters = {};
  let matched = false;

  // Gender
  if (/\bmales?\b/.test(query) && !/\bfemales?\b/.test(query)) {
    filters.gender = 'male';
    matched = true;
  } else if (/\bfemales?\b/.test(query) && !/\bmales?\b/.test(query)) {
    filters.gender = 'female';
    matched = true;
  } else if (/\b(males?\s+and\s+females?|females?\s+and\s+males?|people|persons?|individuals?)\b/.test(query)) {
    matched = true;
  }

  // Age group keywords
  if (/\bchildren\b|\bchild\b|\bkids?\b/.test(query)) {
    filters.age_group = 'child';
    matched = true;
  } else if (/\bteen(ager)?s?\b/.test(query)) {
    filters.age_group = 'teenager';
    matched = true;
  } else if (/\badults?\b/.test(query)) {
    filters.age_group = 'adult';
    matched = true;
  } else if (/\bseniors?\b|\belderly\b|\bold\s+people\b/.test(query)) {
    filters.age_group = 'senior';
    matched = true;
  } else if (/\byoung\b/.test(query)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // Age comparisons — "above X", "over X", "below X", "under X", "between X and Y"
  const aboveMatch = query.match(/\b(above|over|older than|greater than)\s+(\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[2]);
    matched = true;
  }

  const belowMatch = query.match(/\b(below|under|younger than|less than)\s+(\d+)/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[2]);
    matched = true;
  }

  const betweenMatch = query.match(/\bbetween\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1]);
    filters.max_age = parseInt(betweenMatch[2]);
    matched = true;
  }

  // Country — check multi-word first, then single
  let foundCountry = false;
  for (const [country, code] of Object.entries(COUNTRY_MAP)) {
    if (query.includes(country)) {
      filters.country_id = code;
      matched = true;
      foundCountry = true;
      break;
    }
  }

  // ISO code fallback e.g. "from NG"
  if (!foundCountry) {
    const isoMatch = query.match(/\bfrom\s+([a-z]{2})\b/i);
    if (isoMatch) {
      filters.country_id = isoMatch[1].toUpperCase();
      matched = true;
    }
  }

  if (!matched) return null;
  return filters;
}

// ─── GET /api/profiles ─────────────────────────────────────────────────────

app.get('/api/profiles', async (req, res) => {
  try {
    const {
      gender, age_group, country_id,
      min_age, max_age,
      min_gender_probability, min_country_probability,
      sort_by, order,
      page, limit,
    } = req.query;

    // Validate types
    const numericFields = { min_age, max_age, min_gender_probability, min_country_probability, page, limit };
    for (const [key, val] of Object.entries(numericFields)) {
      if (val !== undefined && isNaN(Number(val))) {
        return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
      }
    }

    const validSortBy = ['age', 'created_at', 'gender_probability'];
    const validOrder = ['asc', 'desc'];
    if (sort_by && !validSortBy.includes(sort_by)) {
      return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
    }
    if (order && !validOrder.includes(order)) {
      return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;
    const sortCol = validSortBy.includes(sort_by) ? sort_by : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

    const conditions = [];
    const values = [];

    if (gender) { values.push(gender); conditions.push(`gender = $${values.length}`); }
    if (age_group) { values.push(age_group); conditions.push(`age_group = $${values.length}`); }
    if (country_id) { values.push(country_id); conditions.push(`country_id = $${values.length}`); }
    if (min_age) { values.push(parseInt(min_age)); conditions.push(`age >= $${values.length}`); }
    if (max_age) { values.push(parseInt(max_age)); conditions.push(`age <= $${values.length}`); }
    if (min_gender_probability) { values.push(parseFloat(min_gender_probability)); conditions.push(`gender_probability >= $${values.length}`); }
    if (min_country_probability) { values.push(parseFloat(min_country_probability)); conditions.push(`country_probability >= $${values.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM profiles ${where}`, values
    );
    const total = parseInt(countResult.rows[0].count);

    values.push(limitNum);
    values.push(offset);
    const dataResult = await pool.query(
      `SELECT * FROM profiles ${where} ORDER BY ${sortCol} ${sortOrder} LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      status: 'success',
      page: pageNum,
      limit: limitNum,
      total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ─── GET /api/profiles/search ──────────────────────────────────────────────

app.get('/api/profiles/search', async (req, res) => {
  try {
    const { q, page, limit } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ status: 'error', message: 'Missing or empty parameter' });
    }

    const filters = parseNaturalLanguage(q);
    if (!filters) {
      return res.status(200).json({ status: 'error', message: 'Unable to interpret query' });
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const values = [];

    if (filters.gender) { values.push(filters.gender); conditions.push(`gender = $${values.length}`); }
    if (filters.age_group) { values.push(filters.age_group); conditions.push(`age_group = $${values.length}`); }
    if (filters.country_id) { values.push(filters.country_id); conditions.push(`country_id = $${values.length}`); }
    if (filters.min_age !== undefined) { values.push(filters.min_age); conditions.push(`age >= $${values.length}`); }
    if (filters.max_age !== undefined) { values.push(filters.max_age); conditions.push(`age <= $${values.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(`SELECT COUNT(*) FROM profiles ${where}`, values);
    const total = parseInt(countResult.rows[0].count);

    values.push(limitNum);
    values.push(offset);
    const dataResult = await pool.query(
      `SELECT * FROM profiles ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      status: 'success',
      page: pageNum,
      limit: limitNum,
      total,
      data: dataResult.rows,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// ─── 404 fallback ──────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

// ─── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Insighta API running on port ${PORT}`);
});