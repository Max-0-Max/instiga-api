# instiga-api

# Insighta Labs API — Stage 2

A demographic intelligence REST API built with Node.js, Express, and PostgreSQL. Supports advanced filtering, sorting, pagination, and **rule-based** natural language search.

---

## Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Deployment**: Railway / Render-compatible (Render excluded per spec)

---

## Getting Started

### 1. Clone & install

```bash
git clone <your-repo-url>
cd insighta-api
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials
```

```env
DATABASE_URL=postgresql://user:password@host:5432/insighta
DATABASE_SSL=true   # set false for local Postgres
PORT=3000
```

### 3. Run migrations

```bash
npm run migrate
```

### 4. Seed the database

Place the `profiles.json` file in the `data/` directory, then:

```bash
npm run seed
# or with a custom path:
node scripts/seed.js /path/to/profiles.json
```

Re-running the seed is safe — duplicate records are skipped via `ON CONFLICT (name) DO NOTHING`.

### 5. Start the server

```bash
npm start         # production
npm run dev       # development with nodemon
```

---

## Endpoints

### `GET /api/profiles`

Returns profiles with optional filtering, sorting, and pagination.

**Query Parameters**

| Parameter               | Type   | Description                                      |
|------------------------|--------|--------------------------------------------------|
| `gender`               | string | `male` or `female`                               |
| `age_group`            | string | `child`, `teenager`, `adult`, `senior`           |
| `country_id`           | string | ISO-2 code e.g. `NG`, `KE`                       |
| `min_age`              | int    | Minimum age (inclusive)                          |
| `max_age`              | int    | Maximum age (inclusive)                          |
| `min_gender_probability` | float | Minimum gender confidence score                |
| `min_country_probability` | float | Minimum country confidence score              |
| `sort_by`              | string | `age` \| `created_at` \| `gender_probability`   |
| `order`                | string | `asc` \| `desc` (default: `asc`)                |
| `page`                 | int    | Page number (default: `1`)                       |
| `limit`                | int    | Results per page (default: `10`, max: `50`)      |

**Example**

```
GET /api/profiles?gender=male&country_id=NG&min_age=25&sort_by=age&order=desc&page=1&limit=10
```

**Success Response (200)**

```json
{
  "status": "success",
  "page": 1,
  "limit": 10,
  "total": 312,
  "data": [
    {
      "id": "019591e2-7d4a-7c91-9c2a-1f0a8e5b6d12",
      "name": "emmanuel",
      "gender": "male",
      "gender_probability": 0.99,
      "age": 34,
      "age_group": "adult",
      "country_id": "NG",
      "country_name": "Nigeria",
      "country_probability": 0.85,
      "created_at": "2026-04-01T12:00:00Z"
    }
  ]
}
```

---

### `GET /api/profiles/search`

Natural language query endpoint. Converts plain English into database filters.

**Query Parameters**

| Parameter | Type   | Description                         |
|-----------|--------|-------------------------------------|
| `q`       | string | Natural language query (required)   |
| `page`    | int    | Page number (default: `1`)          |
| `limit`   | int    | Results per page (default: `10`)    |
| `sort_by` | string | Same as `/api/profiles`             |
| `order`   | string | Same as `/api/profiles`             |

**Examples**

```
GET /api/profiles/search?q=young males from nigeria
GET /api/profiles/search?q=adult females above 30 from kenya
GET /api/profiles/search?q=teenagers from ghana
```

---

## Natural Language Parsing Approach

The parser (`src/parser.js`) is **purely rule-based** — no AI, no LLMs, no external APIs. It uses regular expressions and a keyword dictionary to extract filter intent from free text.

### How it works

The input string is lowercased and then scanned in sequence for these signal types:

---

#### 1. Gender Detection

Regex scans for gendered terms. If both genders are mentioned together (`"male and female"`), no gender filter is applied.

| Input keywords                       | Mapped to         |
|--------------------------------------|-------------------|
| `male`, `males`, `men`, `man`, `boys` | `gender=male`    |
| `female`, `females`, `women`, `woman`, `girls` | `gender=female` |
| `male and female`, `both genders`    | *(no filter)*     |

---

#### 2. Age Group Detection

| Input keywords                              | Mapped to              |
|---------------------------------------------|------------------------|
| `child`, `children`, `kids`                 | `age_group=child`      |
| `teenager`, `teenagers`, `teen`, `adolescent` | `age_group=teenager` |
| `adult`, `adults`                           | `age_group=adult`      |
| `senior`, `seniors`, `elderly`, `old people` | `age_group=senior`   |

---

#### 3. "Young" Keyword (special case)

Per spec, `"young"` is not a stored `age_group`. It maps to a numeric age range:

| Input keyword  | Mapped to                        |
|----------------|----------------------------------|
| `young`        | `min_age=16` + `max_age=24`     |
| `younger`      | `min_age=16` + `max_age=24`     |

---

#### 4. Explicit Age Constraints

| Pattern                              | Example                   | Mapped to         |
|--------------------------------------|---------------------------|-------------------|
| `above N`, `over N`, `older than N`  | `above 30`                | `min_age=30`      |
| `below N`, `under N`, `younger than N` | `under 18`              | `max_age=18`      |
| `between N and M`                    | `between 20 and 40`       | `min_age=20`, `max_age=40` |
| `aged N`, `age N`                    | `aged 25`                 | `min_age=25`, `max_age=25` |

---

#### 5. Country Detection

Two-pass matching:

1. **Contextual pass**: looks for patterns like `"from <country>"`, `"in <country>"`, `"of <country>"` and extracts the country name.
2. **Fallback scan**: scans the entire query for any known country name or demonym (longest match wins to avoid partial matches like "niger" matching "nigeria").

The country dictionary includes ~60 African nations (primary dataset) plus common global countries.

| Example query                    | Mapped to          |
|----------------------------------|--------------------|
| `from nigeria`                   | `country_id=NG`    |
| `nigerians`                      | `country_id=NG`    |
| `people in kenya`                | `country_id=KE`    |
| `angolan women`                  | `country_id=AO`    |

---

#### 6. Validity check

If **no signals are matched** (empty filters object), the parser returns `null` and the endpoint responds with:

```json
{ "status": "error", "message": "Unable to interpret query" }
```

---

### Example mappings (spec-required)

| Query                                | Filters applied                                         |
|--------------------------------------|---------------------------------------------------------|
| `young males`                        | `gender=male`, `min_age=16`, `max_age=24`              |
| `females above 30`                   | `gender=female`, `min_age=30`                          |
| `people from angola`                 | `country_id=AO`                                        |
| `adult males from kenya`             | `gender=male`, `age_group=adult`, `country_id=KE`      |
| `male and female teenagers above 17` | `age_group=teenager`, `min_age=17`                     |

---

## Limitations & Known Edge Cases

### Parser limitations

1. **No semantic understanding**: The parser only recognises exact or near-exact keyword matches. Paraphrases like *"grown-up people"* or *"folks in their thirties"* will not parse correctly.

2. **Single country per query**: The parser extracts the first matching country. Queries like *"males from Nigeria or Ghana"* will only capture one country.

3. **No negation handling**: *"everyone except males"* or *"not from Nigeria"* will not be parsed as negation — it may accidentally match `"from Nigeria"` positively.

4. **"Young" is not composable with age_group**: A query like *"young adults"* will apply both `age_group=adult` AND `min_age=16/max_age=24` simultaneously, which may return an empty result if those constraints conflict.

5. **Ambiguous demonyms**: *"Niger"* and *"Nigerian"* are distinct. The parser uses longest-match to prefer *"Nigeria"* → `NG` over *"Niger"* → `NE`, but edge cases may occur.

6. **No probability filters from NL**: Natural language queries don't support `min_gender_probability` or `min_country_probability`. Use the structured `/api/profiles` endpoint for those.

7. **No "and" logic across countries**: The parser doesn't support OR conditions across any field.

8. **Typos**: There is no fuzzy matching. `"Nigria"` will not resolve to Nigeria.

9. **Age group + explicit age conflicts**: If you write `"children above 30"`, both `age_group=child` and `min_age=30` are applied — which returns zero results because children are under 13. This is a valid (if vacuous) query; the API returns `total: 0`.

10. **"People" keyword**: Words like `people`, `persons`, `individuals`, `users` are ignored — they contribute no filter signal by themselves.

---

## Error Responses

All errors use this structure:

```json
{ "status": "error", "message": "<description>" }
```

| Status | Scenario                                      |
|--------|-----------------------------------------------|
| 400    | Missing required parameter (e.g. empty `q`)   |
| 400    | Uninterpretable NL query                      |
| 422    | Invalid parameter type (e.g. `min_age=abc`)   |
| 500    | Unexpected server error                       |

---

## Performance Notes

- All filter columns (`gender`, `age_group`, `country_id`, `age`, `created_at`, `gender_probability`, `country_probability`) are indexed.
- Paginated queries use `LIMIT`/`OFFSET` with a separate `COUNT(*)` on the filtered set — no full-table scans on hot paths.
- The seed script uses `ON CONFLICT DO NOTHING` for idempotent re-seeding.

---

## CORS

All responses include:

```
Access-Control-Allow-Origin: *
```

This is required for the grading script.
