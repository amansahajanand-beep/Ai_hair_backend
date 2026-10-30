# Single Active Subscription with Pending Queue System

## 🎯 Overview

The system now supports **only ONE active subscription at a time** with an automatic **pending queue** for future subscriptions.

### Key Features

✅ **One Active Subscription**: Only one subscription can be `status = "active"` at any time  
✅ **Pending Queue**: Additional purchases go into `status = "pending"`  
✅ **Auto-Activation**: Pending subscriptions automatically activate when current expires  
✅ **Full Duration**: Validity period starts when subscription activates, not when purchased  
✅ **No Manual Action**: Activation happens automatically  

---

## 🔄 How It Works

### Purchase Flow

```
User has NO active subscription
└─> Purchase Week Plan → Status: ACTIVE ✅

User has ACTIVE Week subscription
└─> Purchase Month Plan → Status: PENDING ⏳
    └─> Will activate when Week expires

User has ACTIVE Week + PENDING Month
└─> Purchase Year Plan → Status: PENDING ⏳
    └─> Will activate after Month
```

### Activation Flow

```
Week Plan (Active) → Expires
   ↓
Auto-activation triggered
   ↓
Month Plan (Pending → Active) ✅
   ↓
Year Plan remains Pending
   ↓
Month Plan → Expires
   ↓
Year Plan (Pending → Active) ✅
```

---

## 📊 Subscription States

| Status | Description | Quota | Image Generation |
|--------|-------------|-------|------------------|
| **active** | Currently active subscription | Full quota | ✅ Yes |
| **pending** | Waiting to activate | 0 | ❌ No |
| **expired** | Expired subscription | 0 | ❌ No |

---

## 🚀 API Examples

### Example 1: First Purchase (Becomes Active)

**Request:**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_001",
    "is_premium":true,
    "purchase_id":"P001",
    "plan_type":"week",
    "purchase_date":"2026-08-03T00:00:00Z",
    "expiry_date":"2026-08-10T00:00:00Z"
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "device_id": "user_001",
    "free_limit": 0,
    "total_available_images": 8,
    "image_generation": true,
    "subscription": {
      "plan_type": "week",
      "status": "active",
      "total_quota": 50,
      "today_remaining": 8,
      "expiry_date": "2026-08-10T00:00:00Z"
    }
  }
}
```

---

### Example 2: Second Purchase (Becomes Pending)

**Request:**
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
      }
    ]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "device_id": "user_001",
    "free_limit": 0,
    "total_available_images": 8,
    "image_generation": true,
    "subscription": {
      "plan_type": "week",
      "status": "active",
      "total_quota": 50,
      "today_remaining": 8,
      "expiry_date": "2026-08-10T00:00:00Z"
    },
    "pending_subscriptions": [
      {
        "purchase_id": "P001",
        "plan_type": "month75",
        "status": "pending",
        "queue_position": 1,
        "will_activate_after": "2026-08-10T00:00:00Z",
        "total_quota": 75
      }
    ],
    "next_subscription": {
      "purchase_id": "P001",
      "plan_type": "month75",
      "status": "pending",
      "queue_position": 1
    }
  }
}
```

---

### Example 3: Multiple Pending Subscriptions

**Request:**
```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id":"user_001",
    "is_premium":true,
    "purchase_id":"P001",
    "plans":[
      {
        "plan_type":"week",
        "purchase_date":"2026-08-03T00:00:00Z",
        "expiry_date":"2026-08-10T00:00:00Z"
      },
      {
        "plan_type":"month75",
        "purchase_date":"2026-08-03T00:00:00Z",
        "expiry_date":"2026-09-03T00:00:00Z"
      },
      {
        "plan_type":"year",
        "purchase_date":"2026-08-03T00:00:00Z",
        "expiry_date":"2027-08-03T00:00:00Z"
      }
    ]
  }'
```

**Response:**
```json
{
  "subscription": {
    "plan_type": "week",
    "status": "active"
  },
  "pending_subscriptions": [
    {
      "plan_type": "month75",
      "status": "pending",
      "queue_position": 1
    },
    {
      "plan_type": "year",
      "status": "pending",
      "queue_position": 2
    }
  ]
}
```

---

## 🔧 Technical Implementation

### Files Modified

| File | Changes |
|------|---------|
| `src/models/subscription.model.js` | Added "pending" status, activatedAt, queuePosition |
| `src/services/hairstyle-api/subscription.service.js` | Pending queue logic, auto-activation |
| `src/services/hairstyle-api/quota.service.js` | Auto-activate on expire |
| `src/controllers/hairstyle-api/limitStatus.controller.js` | Show active + pending separately |
| `src/services/hairstyle-api/subscription-activation.service.js` | Background activation checker |
| `src/cron/subscription-activation.cron.js` | Hourly cron job |

### Database Schema Changes

**New Fields in Subscription Model:**
```javascript
{
  status: "active" | "pending" | "expired",
  activatedAt: Date,        // When subscription became active
  queuePosition: Number     // 0 = active, 1 = next, 2 = after that
}
```

---

## ⚙️ Auto-Activation Mechanism

### Primary: Inline Activation
When `quotaService.markExpired()` is called on an active subscription:
1. Mark subscription as expired
2. Clear its quota
3. Call `activateNextPendingSubscription(userId)`
4. Next pending subscription becomes active automatically

### Backup: Cron Job
Runs every hour via `subscription-activation.cron.js`:
1. Finds all expired active subscriptions
2. Marks them as expired
3. Triggers activation of pending subscriptions
4. Provides reliability if inline activation missed

---

## 🎯 Key Behaviors

### 1. Queue Position
- Active subscription: `queuePosition = 0`
- Next pending: `queuePosition = 1`
- After that: `queuePosition = 2`, etc.

### 2. Validity Period
- **Active subscription**: Uses original purchase_date and expiry_date
- **Pending subscription**: Validity starts when activated
  - `purchaseDate` = activation time
  - `expiryDate` = activation time + plan duration

### 3. Quota Calculation
- **Active subscription**: Full quota, daily distribution, carry-forward
- **Pending subscription**: `remainingQuota = 0`, no quota until activated

### 4. Image Generation
- Uses **ONLY** active subscription quota
- Pending subscriptions do NOT contribute to available images

---

## 🧪 Testing Scenarios

### Test 1: Simple Pending Queue
```bash
# Purchase Week (becomes active)
curl ... -d '{"plan_type":"week",...}'
# Expected: status="active", total_available_images > 0

# Purchase Month (becomes pending)
curl ... -d '{"plan_type":"month75",...}'
# Expected: week still active, month pending, queue_position=1

# Wait for week to expire or manually expire
# Expected: month auto-activates, becomes active
```

### Test 2: Multiple Pending
```bash
# Purchase Week, Month, Year in one request
curl ... -d '{"plans":[{"plan_type":"week"},{"plan_type":"month75"},{"plan_type":"year"}]}'

# Expected:
# - Week: active
# - Month: pending, queue_position=1
# - Year: pending, queue_position=2
```

### Test 3: Quota Check
```bash
# With active + pending subscriptions
curl ... -d '{"device_id":"user_001","is_premium":false}'

# Expected:
# - total_available_images = only active subscription quota
# - pending subscriptions not counted
```

---

## 🔍 Monitoring

### Check Pending Subscriptions
```javascript
const activationService = require('./src/services/hairstyle-api/subscription-activation.service');

const stats = await activationService.getPendingSubscriptionStats();
console.log(stats);
// { total_pending: 5, by_plan_type: [...] }
```

### Manual Activation (Testing)
```javascript
const activated = await activationService.manuallyActivateNextForUser('user_001');
console.log(activated); // Activated subscription details
```

---

## 📋 Setup Instructions

### 1. Database Migration
No migration needed! New fields have default values.

### 2. Install Cron Dependency
```bash
npm install node-cron
```

### 3. Initialize Cron in Server
Add to your `server.js` or `app.js`:

```javascript
const subscriptionCron = require('./src/cron/subscription-activation.cron');

// Initialize cron job
subscriptionCron.initializeSubscriptionActivationCron();
```

### 4. Test Immediately (Optional)
```javascript
const subscriptionCron = require('./src/cron/subscription-activation.cron');

// Run activation check now
await subscriptionCron.runActivationCheckNow();
```

---

## ✅ Benefits

1. **No Confusion**: Only one subscription active = clear user experience
2. **Fair Timing**: Users get full duration when subscription activates
3. **Automatic**: No manual intervention needed
4. **Predictable**: Clear queue order
5. **Reliable**: Dual activation mechanism (inline + cron)

---

## 🚨 Important Notes

1. **Pending ≠ Available**: Pending subscriptions don't provide any quota
2. **One at a Time**: Only ONE subscription can be active
3. **Auto-Activation**: Happens automatically when current expires
4. **Full Duration**: Pending plans get full duration from activation time
5. **Free Limit**: Becomes 0 on ANY purchase (active or pending)

---

## 📊 Comparison

| Feature | Old (Multiple Active) | New (Single Active + Queue) |
|---------|----------------------|---------------------------|
| Active subscriptions | Multiple | One only |
| Quota calculation | Sum of all | Only active |
| New purchase behavior | All active together | Becomes pending |
| Activation | Immediate | Auto when current expires |
| Duration start | Purchase time | Activation time |

---

## ✅ Status

**Implementation**: Complete ✅  
**Testing**: Ready ✅  
**Documentation**: Complete ✅  
**Cron Job**: Available ✅  

**Ready for Production!** 🚀
