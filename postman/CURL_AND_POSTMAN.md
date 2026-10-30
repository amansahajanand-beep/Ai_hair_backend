# Daily quota - cURL and Postman

Local base URL: `http://localhost:3000` (`PORT` in `.env`).
Production base URL: your deployed API host (not stored in the project; the code only whitelists the *frontend* origins in CORS, and cURL/Postman send no Origin header so they are allowed).

No auth header is needed. Set `MOCK_GENERATION=true` in `.env` to test without spending AILab credits.

```bash
BASE=http://localhost:3000        # production: BASE=https://YOUR-API-HOST
DEV=curl-test-$(date +%s)         # fresh device = fresh quota
IMG=./photo.jpg                   # any local image
```

## 1. Check remaining quota (read-only)

```bash
curl -s -X POST $BASE/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d "{\"device_id\":\"$DEV\"}"
```

```json
{ "success": true, "data": { "device_id": "...", "free_limit": 3, "used": 0, "remaining": 3,
  "expired": false, "total_available_images": 3, "image_generation": true,
  "subscription_expired": false, "daily_limit": 3, "date": "2030-01-01",
  "resets_at": "2030-01-02T00:00:00.000Z", "message": "You have 3 generations remaining today." } }
```

## 2. Generate a hairstyle (within quota)

`hair_style` and `color` are the ids used in the project's asset names (e.g. `LowFade`, `ManBun`; colors `blonde`, `red`, ...).

```bash
curl -s -X POST $BASE/api/hairstyle \
  -F "image=@$IMG" -F "device_id=$DEV" \
  -F "hair_style=LowFade" -F "color=blonde" \
```

```json
{ "success": true, "image": "https://..." }
```

(With `MOCK_GENERATION=true` it also includes `"mocked": true`.)

## 3. Generate a beard (same quota)

```bash
curl -s -X POST $BASE/api/hairstyle -F "image=@$IMG" -F "device_id=$DEV" -F "beard_style=Goatee"
```

## 4. Quota exceeded (4th request)

Run step 2 four times with the same `$DEV`:

```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "request $i -> HTTP %{http_code}\n" -X POST $BASE/api/hairstyle \
    -F "image=@$IMG" -F "device_id=$DEV" -F "hair_style=LowFade" -F "color=blonde"
done
```

Expected: `200, 200, 200, 429`. The 429 body:

```json
{ "success": false, "error": "Daily limit reached (3/day). Please try again tomorrow.",
  "code": "DAILY_QUOTA_EXCEEDED", "device_id": "...", "daily_limit": 3, "used": 3,
  "remaining": 0, "exceeded": true, "date": "2030-01-01", "resets_at": "2030-01-02T00:00:00.000Z" }
```

## 5. Invalid / missing device_id (HTTP 400)

```bash
curl -s -X POST $BASE/api/hairstyle -F "image=@$IMG" -F "hair_style=LowFade" -F "color=blonde"
# {"success":false,"error":"device_id is required and must be 1-128 printable characters without spaces","code":"INVALID_DEVICE_ID"}
```

## 6. Testing the next-day reset

The reset happens when the date changes, so over HTTP you cannot jump ahead in time. Two ways:

**a) Simulate it in MongoDB** (moves today's counter to yesterday, so the device starts a new day):

```js
// mongosh
use hair-backend
db.dailyapiusages.updateOne(
  { device_id: "YOUR_DEVICE_ID", date: "2030-01-01" },   // today's date from the 429 response
  { $set: { date: "2000-01-01" } }
)
```

Then call step 2 again: it succeeds and `check-free-limit` shows `remaining: 3`.

**b) Automated test** with an injected clock: `TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hair-quota-test node scripts/test-daily-quota.js` (test "quota resets on the next day").

## Postman

1. Postman > **Import** > select `postman/hair-backend-daily-quota.postman_collection.json`.
2. Open the collection > **Variables**: `base_url` is `http://localhost:3000`; set `production_url` if you want the production folder.
3. In each **Generate** request: Body > form-data > `image` > **Select Files** and pick a photo. (Postman cannot store file paths in the collection; select it once per request.)
4. Start the server (`MOCK_GENERATION=true` recommended, `DAILY_API_QUOTA=3`).
5. Run the folder **Quota flow** with the Collection Runner. Step 1 creates a new `device_id`; steps run in order and each has tests: remaining 3 -> three 200s -> a 429 -> remaining 0.
6. "Other requests" contains single calls: beard, missing device_id (400), missing color (500, no charge).
