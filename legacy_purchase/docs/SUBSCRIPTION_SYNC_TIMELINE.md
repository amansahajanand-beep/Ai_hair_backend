# Subscription Synchronization - Timeline-Based Activation

## 🎯 Overview

The `check` API now treats incoming subscription data as the **source of truth**. Subscriptions missing from the request are automatically deleted, and the active subscription is determined by **timeline order** (earliest `purchase_date`), not by deletion order.

### Key Behaviors

✅ **Source of Truth**: Check API request defines what subscriptions should exist  
✅ **Auto-Delete Missing**: Subscriptions in DB but not in request are removed  
✅ **Timeline-Based**: Active subscription = earliest `purchase_date`  
✅ **No Immediate Activation**: Deletion doesn't trigger next-in-queue activation  
✅ **Maintain Order**: Subscriptions ordered by original purchase timeline  

---

## 🔄 How Synchronization Works

### Before Synchronization
```
Database:
- Weekly (1 Aug) - Active
- Monthly (3 Aug) - Pending (queue: 1)
- Yearly (10 Aug) - Pending (queue: 2)

Latest Check API Request:
- Monthly (3 Aug)
- Yearly (10 Aug)
```

### After Synchronization
```
1. Delete Weekly (not in request)
2. Remaining: Monthly (3 Aug), Yearly (10 Aug)
3. Sort by purchase_date
4. Earliest (Monthly) → Active
5. Rest (Yearly) → Pending

Result:
- Monthly (3 Aug) - Active ✅
- Yearly (10 Aug) - Pending (queue: 1)
```

**Key Point**: Monthly becomes active because it has the **earliest purchase_date**, NOT because it was next in the pending queue.

---

## 📊 Example Scenarios

### Scenario 1: Delete Active, Timeline Determines Next

**Initial State:**
```json
{
  "subscriptions": [
    { "plan_type": "week", "purchase_date": "2026-08-01", "status": "active" },
    { "plan_type": "month75", "purchase_date": "2026-08-03", "status": "pending" },
    { "plan_type": "year", "purchase_date": "2026-08-10", "status": "pending" }
  ]
}
```

**Check API Request (Week missing):**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_001",
    "is_premium":true,
    "purchase_id":"P001",
    "plans":[
      {
        "plan_type":"month75",
        "purchase_date":"2026-08-03T00:00:00Z",
        "expiry_date":"2026-09-03T00:00:00Z"
      },
      {
        "plan_type":"year",
        "purchase_date":"2026-08-10T00:00:00Z",
        "expiry_date":"2027-08-10T00:00:00Z"
      }
    ]
  }'
```

**Result:**
```json
{
  "subscription": {
    "plan_type": "month75",
    "purchase_date": "2026-08-03",
    "status": "active"
  },
  "pending_subscriptions": [
    {
      "plan_type": "year",
      "purchase_date": "2026-08-10",
      "status": "pending",
      "queue_position": 1
    }
  ]
}
```

**Why Month75 is Active**: Earliest `purchase_date` among remaining subscriptions.

---

### Scenario 2: Delete Middle Subscription

**Initial State:**
```
- Week (1 Aug) - Active
- Month (5 Aug) - Pending
- Year (10 Aug) - Pending
```

**Check API Request (Month missing):**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_002",
    "is_premium":true,
    "purchase_id":"P002",
    "plans":[
      {
        "plan_type":"week",
        "purchase_date":"2026-08-01T00:00:00Z",
        "expiry_date":"2026-08-08T00:00:00Z"
      },
      {
        "plan_type":"year",
        "purchase_date":"2026-08-10T00:00:00Z",
        "expiry_date":"2027-08-10T00:00:00Z"
      }
    ]
  }'
```

**Result:**
```
- Week (1 Aug) - Active ✅ (still earliest)
- Year (10 Aug) - Pending (queue: 1)
```

**Why Week Stays Active**: Still has the earliest `purchase_date`.

---

### Scenario 3: Delete All Except One

**Initial State:**
```
- Week (1 Aug) - Active
- Month (5 Aug) - Pending
- Year (10 Aug) - Pending
```

**Check API Request (Only Year):**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_003",
    "is_premium":true,
    "purchase_id":"P003",
    "plan_type":"year",
    "purchase_date":"2026-08-10T00:00:00Z",
    "expiry_date":"2027-08-10T00:00:00Z"
  }'
```

**Result:**
```
- Year (10 Aug) - Active ✅ (only one remaining)
```

**Why Year is Active**: Only subscription left, so it becomes active.

---

### Scenario 4: Reorder Based on Timeline

**Initial State (Mixed Order):**
```
- Year (10 Aug) - Active (was created first)
- Month (3 Aug) - Pending (created second, but earlier date)
- Week (1 Aug) - Pending (created last, but earliest date)
```

**Check API Request (All three):**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_004",
    "is_premium":true,
    "purchase_id":"P004",
    "plans":[
      {
        "plan_type":"week",
        "purchase_date":"2026-08-01T00:00:00Z",
        "expiry_date":"2026-08-08T00:00:00Z"
      },
      {
        "plan_type":"month75",
        "purchase_date":"2026-08-03T00:00:00Z",
        "expiry_date":"2026-09-03T00:00:00Z"
      },
      {
        "plan_type":"year",
        "purchase_date":"2026-08-10T00:00:00Z",
        "expiry_date":"2027-08-10T00:00:00Z"
      }
    ]
  }'
```

**Result After Sync:**
```
- Week (1 Aug) - Active ✅ (earliest date)
- Month (3 Aug) - Pending (queue: 1)
- Year (10 Aug) - Pending (queue: 2)
```

**Why Reordered**: Synchronization recalculates based on `purchase_date` order.

---

## 🔧 Technical Implementation

### Synchronization Algorithm

```javascript
1. Get all existing subscriptions from DB (active + pending)
2. Build set of requested subscription IDs from API request
3. Identify subscriptions in DB but NOT in request
4. Delete those subscriptions
5. Get remaining subscriptions
6. Sort by purchase_date (earliest first)
7. First subscription → Active
8. Rest → Pending (queue positions 1, 2, 3...)
9. Update database
10. Return result
```

### Key Functions

**`synchronizeSubscriptions(userId, requestedSubscriptions)`**
- Deletes missing subscriptions
- Recalculates active/pending based on timeline
- Returns: `{ deleted: [], active: subscription, pending: [] }`

### When Synchronization Runs

Synchronization is triggered in the `check-free-limit` API when:
- `is_premium = true`
- Subscription data is provided in the request
- After subscriptions are created/updated

---

## 📋 Synchronization Rules

| Rule | Behavior |
|------|----------|
| **Source of Truth** | Check API request defines valid subscriptions |
| **Missing = Delete** | Subscriptions not in request are removed from DB |
| **Timeline First** | Active subscription = earliest `purchase_date` |
| **No Auto-Activate** | Deletion doesn't activate next-in-queue |
| **Preserve Order** | Pending subscriptions ordered by `purchase_date` |
| **One Active** | Always exactly ONE active subscription |
| **Queue Positions** | Recalculated: 0 = active, 1+ = pending |

---

## 🧪 Test Cases

### Test 1: Delete Active, Activate by Timeline
```bash
# Setup: Create Week (1 Aug), Month (3 Aug), Year (10 Aug)
# Week is active, others pending

# Send request with only Month and Year
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"sync_test_1",
    "is_premium":true,
    "purchase_id":"SYNC_001",
    "plans":[
      {"plan_type":"month75","purchase_date":"2026-08-03T00:00:00Z","expiry_date":"2026-09-03T00:00:00Z"},
      {"plan_type":"year","purchase_date":"2026-08-10T00:00:00Z","expiry_date":"2027-08-10T00:00:00Z"}
    ]
  }'

# Expected:
# - Week deleted
# - Month active (earliest date)
# - Year pending (queue: 1)
```

### Test 2: Delete Pending, Active Unchanged
```bash
# Setup: Week (1 Aug) active, Month (5 Aug) pending, Year (10 Aug) pending

# Send request with only Week and Year
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"sync_test_2",
    "is_premium":true,
    "purchase_id":"SYNC_002",
    "plans":[
      {"plan_type":"week","purchase_date":"2026-08-01T00:00:00Z","expiry_date":"2026-08-08T00:00:00Z"},
      {"plan_type":"year","purchase_date":"2026-08-10T00:00:00Z","expiry_date":"2027-08-10T00:00:00Z"}
    ]
  }'

# Expected:
# - Month deleted
# - Week still active (earliest date)
# - Year pending (queue: 1)
```

### Test 3: Complete Replacement
```bash
# Setup: Week (1 Aug) active, Month (5 Aug) pending

# Send request with completely different subscription
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"sync_test_3",
    "is_premium":true,
    "purchase_id":"SYNC_003",
    "plan_type":"year",
    "purchase_date":"2026-08-03T00:00:00Z",
    "expiry_date":"2027-08-03T00:00:00Z"
  }'

# Expected:
# - Week deleted
# - Month deleted
# - Year active (only one left)
```

---

## ⚠️ Important Notes

1. **Timeline is King**: Active subscription is ALWAYS the one with earliest `purchase_date`
2. **No Immediate Activation**: Deleting active doesn't auto-activate next-in-queue
3. **Recalculation**: Every sync recalculates active/pending from scratch
4. **Atomic Operation**: Synchronization is atomic (all or nothing)
5. **Logging**: Check server logs for `[Sync]` messages

---

## 🔍 Monitoring

### Server Logs
```
[Sync] Deleting subscription 60d5f... (week) - not in request
[Sync] Synchronized subscriptions for user user_001:
  - Deleted: 1
  - Active: month75
  - Pending: 1
```

### Database Verification
```javascript
// Check subscriptions for a user
db.subscriptions.find({ userId: "user_001", status: { $ne: "expired" } })
  .sort({ purchaseDate: 1 })

// Should show:
// 1. Earliest purchase_date → status: "active"
// 2. Later dates → status: "pending"
```

---

## ✅ Status

- ✅ Synchronization function implemented
- ✅ Timeline-based activation logic
- ✅ Controller integration complete
- ✅ No linter errors
- ✅ Atomic and consistent
- ✅ Production-ready

**Ready to use!** 🚀
