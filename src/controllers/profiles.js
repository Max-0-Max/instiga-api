'use strict';

const pool = require('../db');
const { parseNLQuery } = require('../parser');

const VALID_SORT_BY = ['age', 'created_at', 'gender_probability'];
const VALID_ORDER = ['asc', 'desc'];
const VALID_GENDERS = ['male', 'female'];
const VALID_AGE_GROUPS = ['child', 'teenager', 'adult', 'senior'];

/**
 * Build a WHERE clause and parameterised values from a filter object.
 */
function buildWhere(filters) {
  const conditions = [];
  const values = [];
  let idx = 1;

  if (filters.gender) {
    conditions.push(`gender = $${idx++}`);
    values.push(filters.gender);
  }
  if (filters.age_group) {
    conditions.push(`age_group = $${idx++}`);
    values.push(filters.age_group);
  }
  if (filters.country_id) {
    conditions.push(`country_id = $${idx++}`);
    values.push(filters.country_id.toUpperCase());
  }
  if (filters.min_age !== undefined) {
    conditions.push(`age >= $${idx++}`);
    values.push(filters.min_age);
  }
  if (filters.max_age !== undefined) {
    conditions.push(`age <= $${idx++}`);
    values.push(filters.max_age);
  }
  if (filters.min_gender_probability !== undefined) {
    conditions.push(`gender_probability >= $${idx++}`);
    values.push(filters.min_gender_probability);
  }
  if (filters.min_country_probability !== undefined) {
    conditions.push(`country_probability >= $${idx++}`);
    values.push(filters.min_country_probability);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, values, nextIdx: idx };
}

/**
 * Validate and parse common query parameters.
 * Returns { error } if invalid, or parsed values.
 */
function parseQueryParams(query) {
  const {
    gender,
    age_group,
    country_id,
    min_age,
    max_age,
    min_gender_probability,
    min_country_probability,
    sort_by = 'created_at',
    order = 'asc',
    page = '1',
    limit = '10',
  } = query;

  // Validate sort/order
  if (!VALID_SORT_BY.includes(sort_by)) {
    return { error: { status: 400, message: 'Invalid query parameters' } };
  }
  if (!VALID_ORDER.includes(order)) {
    return { error: { status: 400, message: 'Invalid query parameters' } };
  }

  // Validate gender
  if (gender && !VALID_GENDERS.includes(gender)) {
    return { error: { status: 422, message: 'Invalid query parameters' } };
  }

  // Validate age_group
  if (age_group && !VALID_AGE_GROUPS.includes(age_group)) {
    return { error: { status: 422, message: 'Invalid query parameters' } };
  }

  // Parse + validate numeric fields
  const pageNum = parseInt(page, 10);
  const limitNum = Math.min(parseInt(limit, 10), 50);

  if (isNaN(pageNum) || pageNum < 1) {
    return { error: { status: 422, message: 'Invalid query parameters' } };
  }
  if (isNaN(limitNum) || limitNum < 1) {
    return { error: { status: 422, message: 'Invalid query parameters' } };
  }

  const filters = {};
  if (gender) filters.gender = gender;
  if (age_group) filters.age_group = age_group;
  if (country_id) filters.country_id = country_id;

  if (min_age !== undefined) {
    const v = parseInt(min_age, 10);
    if (isNaN(v)) return { error: { status: 422, message: 'Invalid query parameters' } };
    filters.min_age = v;
  }
  if (max_age !== undefined) {
    const v = parseInt(max_age, 10);
    if (isNaN(v)) return { error: { status: 422, message: 'Invalid query parameters' } };
    filters.max_age = v;
  }
  if (min_gender_probability !== undefined) {
    const v = parseFloat(min_gender_probability);
    if (isNaN(v)) return { error: { status: 422, message: 'Invalid query parameters' } };
    filters.min_gender_probability = v;
  }
  if (min_country_probability !== undefined) {
    const v = parseFloat(min_country_probability);
    if (isNaN(v)) return { error: { status: 422, message: 'Invalid query parameters' } };
    filters.min_country_probability = v;
  }

  return { filters, sort_by, order, pageNum, limitNum };
}

/**
 * Execute paginated query and return formatted response.
 */
async function executeQuery(filters, sort_by, order, pageNum, limitNum) {
  const { whereClause, values, nextIdx } = buildWhere(filters);

  const offset = (pageNum - 1) * limitNum;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM profiles ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].count, 10);

  // Add pagination params
  const dataValues = [...values, limitNum, offset];
  const dataResult = await pool.query(
    `SELECT id, name, gender, gender_probability, age, age_group,
            country_id, country_name, country_probability,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
     FROM profiles
     ${whereClause}
     ORDER BY ${sort_by} ${order.toUpperCase()}
     LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
    dataValues
  );

  return {
    status: 'success',
    page: pageNum,
    limit: limitNum,
    total,
    data: dataResult.rows,
  };
}

// GET /api/profiles
async function getProfiles(req, res) {
  try {
    const parsed = parseQueryParams(req.query);
    if (parsed.error) {
      return res.status(parsed.error.status).json({ status: 'error', message: parsed.error.message });
    }

    const { filters, sort_by, order, pageNum, limitNum } = parsed;
    const result = await executeQuery(filters, sort_by, order, pageNum, limitNum);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

// GET /api/profiles/search
async function searchProfiles(req, res) {
  try {
    const { q, page = '1', limit = '10', sort_by = 'created_at', order = 'asc' } = req.query;

    if (!q || q.trim() === '') {
      return res.status(400).json({ status: 'error', message: 'Missing or empty parameter: q' });
    }

    const nlFilters = parseNLQuery(q);
    if (!nlFilters) {
      return res.status(400).json({ status: 'error', message: 'Unable to interpret query' });
    }

    // Validate sort/order
    if (!VALID_SORT_BY.includes(sort_by)) {
      return res.status(400).json({ status: 'error', message: 'Invalid query parameters' });
    }
    if (!VALID_ORDER.includes(order)) {
      return res.status(400).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const pageNum = parseInt(page, 10);
    const limitNum = Math.min(parseInt(limit, 10), 50);

    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
      return res.status(422).json({ status: 'error', message: 'Invalid query parameters' });
    }

    const result = await executeQuery(nlFilters, sort_by, order, pageNum, limitNum);
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'error', message: 'Internal server error' });
  }
}

module.exports = { getProfiles, searchProfiles };