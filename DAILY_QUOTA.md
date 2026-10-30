# Daily API quota

Each `device_id` may make `DAILY_API_QUOTA` successful generations per day (hairstyle and beard share one counter). No purchase, premium or subscription logic exists.

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DAILY_API_QUOTA` | `3` | Positive integer. Invalid values (`0`, `-1`, `2.5`, `abc`) stop the server at startup with a clear error. |
| `QUOTA_TIMEZONE` | `UTC` | IANA timezone; the quota resets at midnight in this zone. |

Restart the app after changing either value.

## Policy

1. Requests are validated first (image, `hair_style`/`color`/`beard_style`, `device_id`). Invalid requests cost nothing.
2. One unit is reserved atomically in MongoDB *before* generation starts. If the limit is reached the API answers `429` and the provider is never called.
3. If generation fails, the unit is released. Only successful generations are charged.
4. Missing or malformed `device_id` (not a string, empty, spaces, over 128 characters) is rejected with `400`.

## Storage

Collection `dailyapiusages`: one document `{ device_id, date, used_count }` per device per day, with a unique index on `(device_id, date)`. A new day means a new document, so no reset job is needed. Documents expire automatically after 35 days.

## API

`POST /api/hairstyle` (unchanged request and success response). Quota exceeded:

```json
HTTP 429
{ "success": false, "error": "Daily limit reached (3/day). Please try again tomorrow.",
  "code": "DAILY_QUOTA_EXCEEDED", "daily_limit": 3, "used": 3, "remaining": 0,
  "exceeded": true, "date": "2030-01-01", "resets_at": "2030-01-02T00:00:00.000Z", "device_id": "..." }
```

`POST /api/check-free-limit` with `{ "device_id": "..." }` is read-only and returns `data.free_limit` (= `DAILY_API_QUOTA`), `used`, `remaining`, `expired`, `total_available_images`, `image_generation`, `message`, plus `daily_limit`, `date`, `resets_at`. `subscription_expired` is kept as `false` for old clients. Premium request fields (`is_premium`, `purchase_id`, ...) are ignored.

## Tests

```
TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hair-quota-test node scripts/test-daily-quota.js
```

Use a throwaway database. The tests run with `MOCK_GENERATION=true`.

## Legacy

The old purchase and subscription code, models, cron and docs were moved (not deleted) to `legacy_purchase/`. Delete that folder once you are satisfied. Old MongoDB collections (`subscriptions`, `dailyquotas`, `monthlyquotas`, `usages`) are untouched and unused.

## New-user onboarding schedule (admin dashboard)

Open `http://localhost:3000/admin` and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` (`.env`). The panel is disabled while `ADMIN_PASSWORD` is empty.

Under **Country limits** the admin sets, per country, how many images a *new* user may generate on each day of a period the admin chooses (1 to 90 days, e.g. 3 or 10). After the last day the user gets a fixed daily limit that the admin also sets (`after_limit`, 0 to 1000), or no limit if "No limit" is ticked. A rule for `DEFAULT` ("All other countries") covers countries without their own rule.

| Situation | Limit |
|---|---|
| New device, country rule (or DEFAULT rule) active | day 1..N = rule values (N = days you set), day N+1 onwards = `after_limit` per day (or unlimited) |
| New device, no active rule | flat `DAILY_API_QUOTA` (as before) |
| Device that used the API before this feature ("existing user") | flat `DAILY_API_QUOTA`, unchanged |

- A device's day 1 is the day it is first seen, by `/api/check-free-limit` or `/api/hairstyle`. Days roll over at midnight in `QUOTA_TIMEZONE`.
- Country is detected in this order: CDN header (`CF-IPCountry`, `CloudFront-Viewer-Country`, `X-Vercel-IP-Country`, `X-Country-Code`), then the request IP (offline `geoip-lite` database; behind Nginx make sure it forwards `X-Forwarded-For`), then a `country` body field. It is fixed at first sight. Private/local IPs (localhost) have no country. Run `npm update geoip-lite` now and then to refresh the IP database.
- A limit of `0` blocks that day. Changes apply to the next request, no restart needed.
- Responses gain `unlimited`, `phase` (`onboarding` | `unlimited` | `standard`), `day`, `country`. For unlimited users `daily_limit`/`remaining` are `999999` so numeric clients keep working; check `unlimited`.
- Collections: `devices`, `quotapolicies`. Tests: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hair-onboarding-test node scripts/test-onboarding-schedule.js`.
