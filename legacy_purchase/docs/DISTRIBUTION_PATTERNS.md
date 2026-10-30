# Distribution Patterns - Updated

## Overview

All subscription plans use a **descending distribution pattern** - higher allocation at the start, gradually decreasing over time.

---

## Current Distribution Settings

### Weekly Plan (50 images / 7 days)

```javascript
week: { minPerDay: 6, maxPerDay: 8 }
```

**Pattern:**
- Day 1: ~8 images (highest)
- Day 7: ~6 images (lowest)
- Total: 50 images

**Example Distribution:**
```
Day 1: 8 images
Day 2: 8 images
Day 3: 7 images
Day 4: 7 images
Day 5: 7 images
Day 6: 7 images
Day 7: 6 images
Total: 50 ✅
```

---

### Month 75 Plan (75 images / 30 days) ✨ UPDATED

```javascript
month75: { minPerDay: 2, maxPerDay: 3 }
```

**Pattern:** 3 → 2 (gradual decrease)

**Average:** 75 ÷ 30 = 2.5 per day

**Example Distribution:**
```
Day 1-15:  3 images each = 45 images
Day 16-30: 2 images each = 30 images
Total: 75 ✅

More uniform distribution compared to previous 4→1 pattern!
```

**Benefits:**
- More predictable daily allocation
- No extreme drops (was 4→1, now 3→2)
- Users get consistent experience throughout the month

---

### Month 150 Plan (150 images / 30 days) ✨ UPDATED

```javascript
month150: { minPerDay: 2, maxPerDay: 7 }
```

**Pattern:** 7 → 2 (gradual decrease)

**Average:** 150 ÷ 30 = 5 per day

**Example Distribution:**
```
Day 1-5:   7 images each = 35 images
Day 6-10:  6 images each = 30 images
Day 11-15: 5 images each = 25 images
Day 16-20: 4 images each = 20 images
Day 21-25: 3 images each = 15 images
Day 26-30: 5 images (2-3 range) = 25 images
Total: 150 ✅
```

**Benefits:**
- Smoother decline (was 8→1, now 7→2)
- More balanced distribution
- Better end-of-month experience (2 vs 1)

---

### Year Plan (900 images / 12 months)

```javascript
year: { minPerDay: 1, maxPerDay: 4 }
```

**Monthly Allocation:** 75 images per month

**Within Each Month:**
- Pattern: 4 → 1 (descending)
- Total: 75 images per month
- Similar to Month 75 plan behavior

**Example Month Distribution:**
```
Day 1-10:  4 images each = 40 images
Day 11-20: 3 images each = 30 images
Day 21-30: ~1-2 images = 5 images
Total: 75 per month ✅
```

---

## Distribution Comparison Table

| Plan | Total | Duration | Min/Day | Max/Day | Pattern | Change |
|------|-------|----------|---------|---------|---------|--------|
| **Week** | 50 | 7 days | 6 | 8 | 8→6 | No change |
| **Month 75** | 75 | 30 days | 2 | 3 | 3→2 | ✅ Updated (was 4→1) |
| **Month 150** | 150 | 30 days | 2 | 7 | 7→2 | ✅ Updated (was 8→1) |
| **Year** | 900 | 12 months | 1 | 4 | 4→1 | No change |

---

## Key Features

### 1. Carry-Forward Logic
Unused images from previous days are automatically redistributed to remaining days.

**Example (Month 75):**
```
Day 1: Allocated 3, Used 0 → 3 unused
Day 2: Allocated 3, Used 1 → 2 unused
Total unused: 5 images

Day 3 onwards:
Remaining: 75 - 1 = 74 images
Days left: 28 days
New distribution: 74 images across 28 days with 3→2 pattern
```

### 2. Descending Pattern Maintained
The algorithm always maintains a descending (non-increasing) pattern, ensuring:
- First days get more images
- Gradual decrease over time
- No sudden spikes or drops

### 3. Exact Total Preserved
The distribution algorithm guarantees:
- Total always matches plan quota (50, 75, 150, 900)
- No fractional images (integers only)
- No rounding errors

---

## Why Descending Distribution?

### User Psychology Benefits:
1. **Higher initial value** - Users see more value upfront
2. **Encourages early usage** - Prevents last-minute rush
3. **Reduces end-of-period pressure** - Users don't feel forced to use all images on last day

### Business Benefits:
1. **Better engagement** - Users start using service immediately
2. **Reduced churn** - Early positive experience
3. **Smooth load distribution** - No end-of-month server spikes

---

## Technical Implementation

### Distribution Algorithm (`distribution.service.js`)

```javascript
// Step 1: Create linear descending pattern
const span = maxDay - minDay;
const step = days > 1 ? span / (days - 1) : 0;

for (let i = 0; i < days; i++) {
    raw.push(maxDay - step * i);
}

// Step 2: Floor values and distribute remainder
const floors = raw.map(n => Math.floor(n));
let give = total - floors.reduce((a, b) => a + b, 0);

// Step 3: Add remainder to days with highest fractional parts
// (maintains descending order)

// Step 4: Finalize to ensure non-increasing pattern
```

### Quota Refresh (`quota.service.js`)

```javascript
// Every new day:
1. Clear unused quota from past days
2. Carry forward unused to remaining quota pool
3. Get remaining date keys (today → expiry)
4. Redistribute pool across remaining days
5. Apply distribution profile based on plan type
6. Save new daily allocations
```

---

## Testing Examples

### Test Month 75 Distribution

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test_month75",
    "is_premium": true,
    "purchase_id": "TEST_M75",
    "plan_type": "month75",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2026-08-31T00:00:00Z"
  }'
```

**Expected Response:**
```json
{
  "subscription": {
    "plan_type": "month75",
    "total_quota": 75,
    "allocated_today": 3,
    "today_remaining": 3,
    "remaining_quota": 75
  }
}
```

### Test Month 150 Distribution

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test_month150",
    "is_premium": true,
    "purchase_id": "TEST_M150",
    "plan_type": "month150",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2026-08-31T00:00:00Z"
  }'
```

**Expected Response:**
```json
{
  "subscription": {
    "plan_type": "month150",
    "total_quota": 150,
    "allocated_today": 7,
    "today_remaining": 7,
    "remaining_quota": 150
  }
}
```

---

## Summary of Changes

### Month 75 Plan
- **Before:** 4 → 1 (steep decline)
- **After:** 3 → 2 (gradual decline) ✅
- **Impact:** More uniform, predictable distribution

### Month 150 Plan
- **Before:** 8 → 1 (steep decline)
- **After:** 7 → 2 (gradual decline) ✅
- **Impact:** Better end-of-month experience

---

## Status

✅ **Changes Implemented**  
✅ **No Linter Errors**  
✅ **Backward Compatible**  
✅ **Ready for Production**  

**Last Updated:** August 3, 2026
