# InnovestAI Backend

REST API for InnovestAI, a portfolio tracking app. It handles watchlists, strategy notes, holdings, market data from Polygon.io and AI risk analysis from OpenAI. Authentication uses Supabase, and data is stored in Supabase Postgres.

## Tech stack

- Node.js and Express 5
- PostgreSQL on Supabase (`pg`)
- Supabase Auth (JWT verification)
- Polygon.io (market data) via `axios`
- OpenAI API (`gpt-4o-mini`)

## Prerequisites

- Node.js 18 or later
- A Supabase project
- A Polygon.io API key
- An OpenAI API key with available credit

## Setup

```bash
npm install
cp .env.example .env   # or create .env manually
npm run dev            # development, auto-restart with nodemon
npm start              # production
```

The server runs at `http://localhost:5000` by default.

## Environment variables

Create a `.env` file in this folder:

| Variable                   | Description                                              |
| -------------------------- | -------------------------------------------------------- |
| `PORT`                     | Server port (default `5000`)                             |
| `DATABASE_URL`             | Supabase Postgres connection string (use the pooler URL) |
| `SUPABASE_URL`             | Project URL, e.g. `https://xxxx.supabase.co`             |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key, `sb_publishable_...`    |
| `POLYGON_API_KEY`          | Polygon.io API key                                       |
| `OPENAI_API_KEY`           | OpenAI API key                                           |

Never commit `.env`. It is listed in `.gitignore`. Do not put Supabase secret or service-role keys in this project unless you need them.

## Database

The API uses these tables in the `public` schema:

- `capstone_user_profiles`: `id` (uuid, matches `auth.users.id`), `display_name`, `tier`, `updated_at`
- `capstone_watchlists`: `id`, `user_id` (references `capstone_user_profiles.id`), `symbol`, `asset_type` (`stock` or `crypto`), `quantity`, `buy_price`, `created_at`, with a unique constraint on `(user_id, symbol)`
- `capstone_asset_notes`: `watchlist_id` (unique), `notes_content`, `updated_at`

A database trigger on `auth.users` creates a `capstone_user_profiles` row for each new sign-up. Row Level Security is enabled on all three tables. The backend connects as the database owner, so every query filters by the authenticated user's id.

## Authentication

Every route requires a Supabase access token:

```
Authorization: Bearer <access_token>
```

The `requireAuth` middleware (`middleware/auth.js`) verifies the token with Supabase and sets `req.user`. Missing or invalid tokens return `401`. In the frontend, get a token with `supabase.auth.getSession()`.

## API reference

Base path: `/api`

### Watchlist

| Method | Path                 | Body                                    | Description                                                       |
| ------ | -------------------- | --------------------------------------- | ----------------------------------------------------------------- |
| GET    | `/watchlist`         |                                         | List the user's assets with notes and holdings                    |
| POST   | `/watchlist`         | `{ symbol, asset_type }`                | Add an asset. `400` for invalid input, `409` if it already exists |
| PUT    | `/watchlist/notes`   | `{ watchlist_id, notes_content }`       | Create or update a strategy note                                  |
| PUT    | `/watchlist/holding` | `{ watchlist_id, quantity, buy_price }` | Set quantity and buy price                                        |
| DELETE | `/watchlist/:id`     |                                         | Remove an asset (notes are deleted with it)                       |

Update and delete routes only affect the authenticated user's own rows. Other users' rows return `404`.

### Market data

| Method | Path                                                                       | Description                            |
| ------ | -------------------------------------------------------------------------- | -------------------------------------- |
| GET    | `/market/stocks/history/:symbol?type=stock\|crypto&tf=15m\|1h\|4h\|1d\|1w` | OHLC candles (`o`, `h`, `l`, `c`, `t`) |
| GET    | `/market/price/:symbol?type=stock\|crypto`                                 | Latest close, `{ "price": 123.45 }`    |

Crypto symbols are converted to Polygon format (`BTC` becomes `X:BTCUSD`). Responses are cached in memory for 10 minutes to stay within Polygon's free-plan rate limit. Errors return `429` (rate limit), `403` (plan limit), `404` (unknown symbol) or `502`.

### AI analysis

| Method | Path          | Body                                                | Description                                      |
| ------ | ------------- | --------------------------------------------------- | ------------------------------------------------ |
| POST   | `/ai/analyze` | `{ portfolioContext: [{ symbol, notes_content }] }` | Returns `{ analysis }`, three risk bullet points |

## Project structure

```
server.js            App entry, middleware and route mounting
config/db.js         Postgres connection pool
middleware/auth.js   Supabase token verification (requireAuth)
routes/watchlist.js  Watchlist, notes and holdings
routes/market.js     Polygon proxy with caching
routes/ai.js         OpenAI portfolio analysis
```

## Testing with curl

```bash
curl http://localhost:5000/api/watchlist -H "Authorization: Bearer $TOKEN"

curl -X POST http://localhost:5000/api/watchlist \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL","asset_type":"stock"}'
```

## Known limitations

- The price cache is in memory, so it resets on restart and is not shared between instances.
- Polygon's free plan allows about 5 requests per minute and end-of-day data.
- CORS is open to all origins. Restrict it to your frontend domain in production.
- The AI route has no per-user rate limit yet.

## Troubleshooting

- **`401 Invalid or expired token`:** access tokens expire after about an hour. Sign in again.
- **Foreign key error on insert:** the user has no `capstone_user_profiles` row. Check the sign-up trigger.
- **AI `insufficient_quota`:** add credit to the OpenAI account.
- **Polygon `429`:** wait a minute, or upgrade the plan.
