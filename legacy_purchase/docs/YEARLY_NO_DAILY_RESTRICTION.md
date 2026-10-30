# Yearly Plan - No Daily Restrictions

## 🎯 Key Difference

### Weekly Plan
- Daily allocation: 8→6 (segmented by day)
- Cannot use tomorrow's images today
- Daily limit enforced

### Monthly Plan  
- Daily allocation: 8→6→3→2 (segmented by day)
- Cannot use tomorrow's images today
- Daily limit enforced

### Yearly Plan ✨
- **NO daily restrictions**
- Entire month's available balance usable anytime
- Can use all images on day 1 if needed
- Only monthly total matters

---

## 📊 How It Works

### Monthly Allocation
```
Month 1:  150
Month 2:  150
Month 3:  150
Month 4:  80
...
```

### Carry-Forward
```
carry_forward = (previous months allocated) - (previous months used)
```

### Current Month Available
```
current_month_available = current_month_allocated + carry_forward
```

### Today's Availability (KEY DIFFERENCE)
```
today_allocated = current_month_available  // ENTIRE month's balance
today_used = images used today only
today_remaining = current_month_available - today_used
```

---

## 🧮 Example: Month 4

### Setup
```
Previous Allocations: 150 + 150 + 150 = 450
Previous Usage: 200
Carry Forward: 450 - 200 = 250
Current Month Allocated: 80
Current Month Available: 80 + 250 = 330
```

### Day 1 of Month 4

**Before Any Usage:**
```json
{
  "current_month": 4,
  "current_month_allocated": 80,
  "current_month_carry_forward": 250,
  "current_month_available": 330,
  "current_month_used": 0,
  "current_month_remaining": 330,
  
  "today_allocated": 330,     // ✅ ENTIRE month's balance
  "today_used": 0,
  "today_remaining": 330,     // ✅ Can use all 330 today if needed
  
  "image_generation": true
}
```

**After Using 20 Images Today:**
```json
{
  "current_month": 4,
  "current_month_allocated": 80,
  "current_month_carry_forward": 250,
  "current_month_available": 330,
  "current_month_used": 20,
  "current_month_remaining": 310,
  
  "today_allocated": 330,     // Still 330 (total available)
  "today_used": 20,
  "today_remaining": 310,     // 330 - 20
  
  "image_generation": true
}
```

**After Using All 330 Images:**
```json
{
  "current_month": 4,
  "current_month_allocated": 80,
  "current_month_carry_forward": 250,
  "current_month_available": 330,
  "current_month_used": 330,
  "current_month_remaining": 0,
  
  "today_allocated": 0,       // No more images
  "today_used": 330,
  "today_remaining": 0,
  
  "image_generation": false   // Cannot generate more
}
```

---

## 📋 Comparison Table

| Aspect | Weekly/Monthly Plans | Yearly Plan |
|--------|---------------------|-------------|
| **Daily Allocation** | Segmented (8→6→2) | No restriction |
| **today_allocated** | Daily segment only | Entire month's balance |
| **Can use all on Day 1?** | No | Yes ✅ |
| **Daily limit** | Yes | No |
| **Monthly total** | Fixed (150) | Base + Carry-forward |

---

## 🧪 Test Scenarios

### Scenario 1: Use 100 Images on Day 1

**Month 4, Current Available: 330**

```
Day 1:
  Before: today_allocated = 330, today_remaining = 330
  Use: 100 images
  After: today_allocated = 330, today_used = 100, today_remaining = 230
  
Day 2:
  today_allocated = 230 (updated monthly remaining)
  today_used = 0 (new day)
  today_remaining = 230
```

---

### Scenario 2: Use All Images on First Day

**Month 4, Current Available: 330**

```
Day 1:
  Before: today_allocated = 330, today_remaining = 330
  Use: 330 images (all)
  After: today_allocated = 0, today_used = 330, today_remaining = 0
  
Day 2:
  today_allocated = 0 (month exhausted)
  today_remaining = 0
  image_generation = false
```

---

### Scenario 3: Gradual Usage

**Month 4, Current Available: 330**

```
Day 1:  Use 50  → Remaining: 280
Day 2:  Use 30  → Remaining: 250
Day 3:  Use 100 → Remaining: 150
Day 4:  Use 50  → Remaining: 100
Day 5:  Use 100 → Remaining: 0
Day 6+: No images available
```

---

## 🔧 Implementation

### Key Change in `ensureYearMonth()`

```javascript
// OLD (Weekly/Monthly): Daily distribution
await writeDailyDistribution(
    subscription._id,
    dateKeys,  // Multiple days
    pool,
    subscription.planType,
    subscription
);

// NEW (Yearly): Single entry with full balance
let todayQuota = await DailyQuota.findOneAndUpdate(
    { subscriptionId: subscription._id, date: todayKey },
    {
        $set: {
            allocatedQuota: monthlyRemaining,  // ENTIRE month's balance
            remainingQuota: monthlyRemaining
        }
    },
    { upsert: true, new: true }
);
```

### Response Fields

```javascript
// For Yearly plan
result.todayAllocated = monthly.remainingQuota;  // FULL month balance
result.todayUsed = todayQuota.usedQuota;
result.todayRemaining = monthly.remainingQuota;  // FULL month balance - used
```

---

## ✅ Validation

### Rule 1: No Daily Restriction
```javascript
yearly: today_allocated = current_month_remaining ✅
weekly: today_allocated = daily_segment (e.g., 8) ✅
monthly: today_allocated = daily_segment (e.g., 8) ✅
```

### Rule 2: Can Use All Anytime
```javascript
yearly: user can use all 330 on day 1 ✅
weekly: user can only use today's 8, not tomorrow's 7 ✅
monthly: user can only use today's 8, not tomorrow's 6 ✅
```

### Rule 3: Today's Remaining
```javascript
yearly: today_remaining = current_month_remaining ✅
weekly: today_remaining = today's segment - today's used ✅
monthly: today_remaining = today's segment - today's used ✅
```

---

## 🧪 API Test

### Month 4 with 330 Available

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "year_no_daily",
    "is_premium": true,
    "purchase_id": "YEAR_ND_001",
    "plan_type": "year",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2027-08-01T00:00:00Z"
  }'
```

**Expected Response (Month 4, assuming 250 carry-forward):**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 700,
    
    "current_month": 4,
    "current_month_allocated": 80,
    "current_month_carry_forward": 250,
    "current_month_available": 330,
    "current_month_used": 0,
    "current_month_remaining": 330,
    
    "today_allocated": 330,      ✅ FULL month balance
    "today_used": 0,
    "today_remaining": 330,      ✅ Can use all 330 today
    
    "image_generation": true
  }
}
```

---

## ⚠️ Important Notes

1. **Weekly Plan**: Unchanged - still uses daily segments ✅
2. **Monthly Plan**: Unchanged - still uses daily segments ✅
3. **Yearly Plan**: No daily restrictions - full month balance available ✅

4. **Why This Makes Sense**:
   - Yearly subscribers pay for flexibility
   - They can use images when needed
   - Not restricted by artificial daily limits
   - Still capped by monthly allocation + carry-forward

5. **Safety**:
   - Still cannot exceed monthly available
   - Still cannot exceed 900 total
   - Still tracks usage properly

---

## 📊 Summary

| Feature | Value |
|---------|-------|
| **Daily Restriction** | None (yearly only) |
| **today_allocated** | current_month_remaining |
| **Can use all Day 1** | Yes ✅ |
| **Weekly/Monthly** | Unchanged ✅ |
| **Safe** | Yes (monthly cap enforced) ✅ |

---

**Status**: ✅ Implemented  
**Affects**: Yearly plan only  
**Weekly/Monthly**: Completely unchanged  
**Last Updated**: August 3, 2026
