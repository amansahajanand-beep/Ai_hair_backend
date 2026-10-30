# Subscription Synchronization - Test Commands

## Quick Test Scenarios

### 🧪 Test 1: Delete Active Subscription (Timeline Determines Next)

```bash
# Step 1: Create initial subscriptions (Week active, Month & Year pending)
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_1",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_001",
    "plans": [
      {
        "plan_type": "week",
        "purchase_date": "2026-08-01T00:00:00Z",
        "expiry_date": "2026-08-08T00:00:00Z"
      },
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-03T00:00:00Z",
        "expiry_date": "2026-09-03T00:00:00Z"
      },
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      }
    ]
  }'

# Expected Response:
# - Week (1 Aug) = Active
# - Month (3 Aug) = Pending
# - Year (10 Aug) = Pending

# Step 2: Send request WITHOUT Week (should delete it and activate Month by timeline)
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_1",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_001",
    "plans": [
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-03T00:00:00Z",
        "expiry_date": "2026-09-03T00:00:00Z"
      },
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      }
    ]
  }'

# Expected Result:
# ✅ Week deleted (not in request)
# ✅ Month75 becomes ACTIVE (earliest purchase_date)
# ✅ Year remains PENDING (queue: 1)
```

---

### 🧪 Test 2: Delete Pending Subscription (Active Unchanged)

```bash
# Step 1: Create subscriptions
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_2",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_002",
    "plans": [
      {
        "plan_type": "week",
        "purchase_date": "2026-08-01T00:00:00Z",
        "expiry_date": "2026-08-08T00:00:00Z"
      },
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-05T00:00:00Z",
        "expiry_date": "2026-09-05T00:00:00Z"
      },
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      }
    ]
  }'

# Expected: Week active, Month & Year pending

# Step 2: Remove Month from request
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_2",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_002",
    "plans": [
      {
        "plan_type": "week",
        "purchase_date": "2026-08-01T00:00:00Z",
        "expiry_date": "2026-08-08T00:00:00Z"
      },
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      }
    ]
  }'

# Expected Result:
# ✅ Month deleted
# ✅ Week STILL ACTIVE (earliest purchase_date)
# ✅ Year pending (queue: 1)
```

---

### 🧪 Test 3: Complete Replacement

```bash
# Step 1: Create initial subscriptions
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_3",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_003",
    "plans": [
      {
        "plan_type": "week",
        "purchase_date": "2026-08-01T00:00:00Z",
        "expiry_date": "2026-08-08T00:00:00Z"
      },
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-05T00:00:00Z",
        "expiry_date": "2026-09-05T00:00:00Z"
      }
    ]
  }'

# Expected: Week active, Month pending

# Step 2: Replace with completely different subscription
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_3",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_003",
    "plan_type": "year",
    "purchase_date": "2026-08-03T00:00:00Z",
    "expiry_date": "2027-08-03T00:00:00Z"
  }'

# Expected Result:
# ✅ Week deleted
# ✅ Month deleted
# ✅ Year becomes ACTIVE (only one remaining)
```

---

### 🧪 Test 4: Reorder by Timeline

```bash
# Scenario: User purchases in wrong order (Year first, then Month, then Week)
# System should reorder by purchase_date

# Step 1: Create Year first
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_4",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_004",
    "plan_type": "year",
    "purchase_date": "2026-08-10T00:00:00Z",
    "expiry_date": "2027-08-10T00:00:00Z"
  }'

# Expected: Year active

# Step 2: Add Month (earlier date than Year)
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_4",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_004",
    "plans": [
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      },
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-03T00:00:00Z",
        "expiry_date": "2026-09-03T00:00:00Z"
      }
    ]
  }'

# Expected: Month active (earlier date), Year pending

# Step 3: Add Week (earliest date)
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_4",
    "is_premium": true,
    "purchase_id": "SYNC_TEST_004",
    "plans": [
      {
        "plan_type": "year",
        "purchase_date": "2026-08-10T00:00:00Z",
        "expiry_date": "2027-08-10T00:00:00Z"
      },
      {
        "plan_type": "month75",
        "purchase_date": "2026-08-03T00:00:00Z",
        "expiry_date": "2026-09-03T00:00:00Z"
      },
      {
        "plan_type": "week",
        "purchase_date": "2026-08-01T00:00:00Z",
        "expiry_date": "2026-08-08T00:00:00Z"
      }
    ]
  }'

# Expected Result:
# ✅ Week = ACTIVE (earliest date: Aug 1)
# ✅ Month = PENDING (queue: 1, date: Aug 3)
# ✅ Year = PENDING (queue: 2, date: Aug 10)
```

---

### 🧪 Test 5: Free User (No Subscriptions)

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "free_user_1",
    "is_premium": false
  }'

# Expected Response:
# {
#   "data": {
#     "device_id": "free_user_1",
#     "free_limit": 3,
#     "used": 0,
#     "remaining": 3,
#     "expired": false,
#     "total_available_images": 3,
#     "image_generation": true,
#     "all_subscriptions_expired": false,
#     "message": "You have 3 free generations remaining."
#   }
# }
```

---

## 🔍 Verify Results

### Check Subscription Status
```bash
# View current subscription state
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "sync_user_1",
    "is_premium": false
  }'
```

### Check Server Logs
Look for these log messages:
```
[Sync] Deleting subscription 60d5f... (week) - not in request
[Sync] Synchronized subscriptions for user sync_user_1:
  - Deleted: 1
  - Active: month75
  - Pending: 1
```

---

## 📊 Expected Response Format

```json
{
  "status": "success",
  "data": {
    "device_id": "sync_user_1",
    "free_limit": 0,
    "used": 0,
    "remaining": 0,
    "expired": false,
    "total_available_images": 8,
    "image_generation": true,
    "all_subscriptions_expired": false,
    "subscription": {
      "purchase_id": "SYNC_TEST_001",
      "plan_type": "month75",
      "status": "active",
      "purchase_date": "2026-08-03T00:00:00.000Z",
      "expiry_date": "2026-09-03T00:00:00.000Z",
      "total_days": 30,
      "current_day": 1,
      "allocated_today": 8,
      "used_today": 0,
      "today_remaining": 8,
      "total_quota": 75,
      "used_quota": 0,
      "remaining_quota": 75
    },
    "pending_subscriptions": [
      {
        "purchase_id": "SYNC_TEST_001",
        "plan_type": "year",
        "status": "pending",
        "queue_position": 1,
        "purchase_date": "2026-08-10T00:00:00.000Z",
        "expiry_date": "2027-08-10T00:00:00.000Z"
      }
    ],
    "next_subscription": {
      "plan_type": "year",
      "activates_on": "2026-09-03T00:00:00.000Z"
    },
    "message": "You have 8 total generations available (0 free and 8 subscription)."
  }
}
```

---

## ⚠️ Important Testing Notes

1. **Use unique device_id** for each test to avoid interference
2. **Check server logs** for `[Sync]` messages to verify deletion and activation
3. **Timeline order** should always be respected (earliest purchase_date = active)
4. **Only ONE active** subscription at any time
5. **Pending subscriptions** ordered by purchase_date

---

## 🎯 What to Verify

✅ Missing subscriptions are deleted  
✅ Active subscription = earliest purchase_date  
✅ Pending subscriptions ordered correctly  
✅ Queue positions recalculated (0, 1, 2...)  
✅ Free limit = 0 after any purchase  
✅ Only active subscription has quota  
✅ Response includes pending_subscriptions array  

---

## 🚀 Ready to Test!

Run the test scenarios above and verify the synchronization logic works as expected.
