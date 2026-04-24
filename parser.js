'use strict';

/**
 * Rule-based natural language parser for profile queries.
 * No AI/LLMs used — pure regex and keyword matching.
 */

// Country name → ISO-2 mapping (Africa-focused based on dataset)
const COUNTRY_MAP = {
  'nigeria': 'NG', 'nigerian': 'NG',
  'ghana': 'GH', 'ghanaian': 'GH',
  'kenya': 'KE', 'kenyan': 'KE',
  'south africa': 'ZA', 'south african': 'ZA',
  'ethiopia': 'ET', 'ethiopian': 'ET',
  'tanzania': 'TZ', 'tanzanian': 'TZ',
  'uganda': 'UG', 'ugandan': 'UG',
  'angola': 'AO', 'angolan': 'AO',
  'mozambique': 'MZ', 'mozambican': 'MZ',
  'cameroon': 'CM', 'cameroonian': 'CM',
  'ivory coast': 'CI', "côte d'ivoire": 'CI', 'ivorian': 'CI',
  'senegal': 'SN', 'senegalese': 'SN',
  'mali': 'ML', 'malian': 'ML',
  'burkina faso': 'BF', 'burkinabe': 'BF',
  'niger': 'NE', 'nigerien': 'NE',
  'chad': 'TD', 'chadian': 'TD',
  'zambia': 'ZM', 'zambian': 'ZM',
  'zimbabwe': 'ZW', 'zimbabwean': 'ZW',
  'rwanda': 'RW', 'rwandan': 'RW',
  'benin': 'BJ', 'beninese': 'BJ',
  'togo': 'TG', 'togolese': 'TG',
  'guinea': 'GN', 'guinean': 'GN',
  'somalia': 'SO', 'somali': 'SO',
  'sudan': 'SD', 'sudanese': 'SD',
  'egypt': 'EG', 'egyptian': 'EG',
  'morocco': 'MA', 'moroccan': 'MA',
  'algeria': 'DZ', 'algerian': 'DZ',
  'tunisia': 'TN', 'tunisian': 'TN',
  'libya': 'LY', 'libyan': 'LY',
  'congo': 'CG', 'congolese': 'CG',
  'democratic republic of congo': 'CD', 'drc': 'CD',
  'madagascar': 'MG', 'malagasy': 'MG',
  'botswana': 'BW', 'botswanan': 'BW',
  'namibia': 'NA', 'namibian': 'NA',
  'malawi': 'MW', 'malawian': 'MW',
  'gabon': 'GA', 'gabonese': 'GA',
  'sierra leone': 'SL',
  'liberia': 'LR', 'liberian': 'LR',
  'gambia': 'GM', 'gambian': 'GM',
  'guinea-bissau': 'GW',
  'cape verde': 'CV', 'cabo verde': 'CV',
  'mauritius': 'MU', 'mauritian': 'MU',
  'seychelles': 'SC',
  'comoros': 'KM',
  'eritrea': 'ER', 'eritrean': 'ER',
  'djibouti': 'DJ',
  'swaziland': 'SZ', 'eswatini': 'SZ',
  'lesotho': 'LS', 'basotho': 'LS',
  'burundi': 'BI', 'burundian': 'BI',
  'central african republic': 'CF',
  'equatorial guinea': 'GQ',
  'sao tome and principe': 'ST',
  // Non-African
  'united states': 'US', 'usa': 'US', 'american': 'US',
  'united kingdom': 'GB', 'uk': 'GB', 'british': 'GB',
  'france': 'FR', 'french': 'FR',
  'germany': 'DE', 'german': 'DE',
  'india': 'IN', 'indian': 'IN',
  'china': 'CN', 'chinese': 'CN',
  'brazil': 'BR', 'brazilian': 'BR',
  'canada': 'CA', 'canadian': 'CA',
  'australia': 'AU', 'australian': 'AU',
  'italy': 'IT', 'italian': 'IT',
  'spain': 'ES', 'spanish': 'ES',
  'portugal': 'PT', 'portuguese': 'PT',
};

/**
 * Parse a natural language query string into filter params.
 * Returns null if the query cannot be interpreted.
 */
function parseNLQuery(q) {
  if (!q || typeof q !== 'string') return null;

  const query = q.toLowerCase().trim();
  const filters = {};
  let matched = false;

  // ── Gender ──────────────────────────────────────────────────────────────
  // "male and female" → no gender filter (both)
  if (!/(male and female|both genders|all genders)/.test(query)) {
    if (/\bfemale(s)?\b|\bwomen\b|\bwoman\b|\bgirls?\b/.test(query)) {
      filters.gender = 'female';
      matched = true;
    } else if (/\bmale(s)?\b|\bmen\b|\bman\b|\bboys?\b/.test(query)) {
      filters.gender = 'male';
      matched = true;
    }
  } else {
    matched = true; // "male and female" is a valid query
  }

  // ── Age group keywords ───────────────────────────────────────────────────
  if (/\bchildren\b|\bchild\b|\bkids?\b/.test(query)) {
    filters.age_group = 'child';
    matched = true;
  } else if (/\bteenager(s)?\b|\bteen(s)?\b|\badolescent(s)?\b/.test(query)) {
    filters.age_group = 'teenager';
    matched = true;
  } else if (/\badult(s)?\b/.test(query)) {
    filters.age_group = 'adult';
    matched = true;
  } else if (/\bsenior(s)?\b|\bolderly\b|\bold people\b|\belderly\b/.test(query)) {
    filters.age_group = 'senior';
    matched = true;
  }

  // ── "young" → ages 16–24 (not a stored age_group) ────────────────────────
  if (/\byoung\b|\byounger\b/.test(query)) {
    filters.min_age = 16;
    filters.max_age = 24;
    matched = true;
  }

  // ── Explicit age constraints ─────────────────────────────────────────────
  // "above/over/older than N"
  const aboveMatch = query.match(/(?:above|over|older than|greater than|>\s*)\s*(\d+)/);
  if (aboveMatch) {
    filters.min_age = parseInt(aboveMatch[1], 10);
    matched = true;
  }

  // "below/under/younger than N"
  const belowMatch = query.match(/(?:below|under|younger than|less than|<\s*)\s*(\d+)/);
  if (belowMatch) {
    filters.max_age = parseInt(belowMatch[1], 10);
    matched = true;
  }

  // "between N and M"
  const betweenMatch = query.match(/between\s+(\d+)\s+and\s+(\d+)/);
  if (betweenMatch) {
    filters.min_age = parseInt(betweenMatch[1], 10);
    filters.max_age = parseInt(betweenMatch[2], 10);
    matched = true;
  }

  // "aged N" or "age N"
  const agedMatch = query.match(/\baged?\s+(\d+)\b/);
  if (agedMatch) {
    filters.min_age = parseInt(agedMatch[1], 10);
    filters.max_age = parseInt(agedMatch[1], 10);
    matched = true;
  }

  // ── Country ──────────────────────────────────────────────────────────────
  // Try multi-word country names first (longest match), then single-word
  let foundCountry = null;

  // "from <country>" or "in <country>" or "of <country>" patterns
  const fromMatch = query.match(/(?:from|in|of)\s+([a-z\s'-]+?)(?:\s+(?:and|who|that|with|aged?|above|below|over|under)|$)/);
  if (fromMatch) {
    const candidate = fromMatch[1].trim();
    // Try multi-word first, then fallback
    for (const [name, code] of Object.entries(COUNTRY_MAP)) {
      if (candidate === name || candidate.endsWith(name) || candidate.startsWith(name)) {
        foundCountry = code;
        matched = true;
        break;
      }
    }
  }

  // Fallback: scan entire query for country names (longest match wins)
  if (!foundCountry) {
    let longestMatch = '';
    for (const [name] of Object.entries(COUNTRY_MAP)) {
      if (query.includes(name) && name.length > longestMatch.length) {
        longestMatch = name;
      }
    }
    if (longestMatch) {
      foundCountry = COUNTRY_MAP[longestMatch];
      matched = true;
    }
  }

  if (foundCountry) {
    filters.country_id = foundCountry;
  }

  // ── If nothing matched, return null ─────────────────────────────────────
  if (!matched || Object.keys(filters).length === 0) {
    return null;
  }

  return filters;
}

module.exports = { parseNLQuery };