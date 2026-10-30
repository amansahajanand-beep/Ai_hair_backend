# Monthly Plan vs Yearly Plan - Distribution Patterns

## 🎯 Overview

**Two Separate Distribution Patterns:**
1. **Monthly Plan** - Standalone monthly subscription (150 images / 30 days)
2. **Yearly Plan** - Yearly subscription with monthly allocations (900 images / 12 months)

---

## 📊 Monthly Plan (month / month150)

### Total: 150 images across 30 days

**Daily Distribution Pattern:**

```
Segment 1 (Days 1-3):    8 images/day  = 24 images   ⭐ HIGH START
Segment 2 (Days 4-27):   6→3 declining = 120 images  📉 GRADUAL
Segment 3 (Days 28-30):  2 images/day  = 6 images    ✅ CONSISTENT END
────────────────────────────────────────────────────────────────────
Total:                                   150 images
```

**Example Daily Breakdown:**
```
Day 1:  8  |████████
Day 2:  8  |████████
Day 3:  8  |████████
Day 4:  6  |██████
Day 5:  6  |██████
Day 6:  6  |██████
Day 7:  5  |█████
...
Day 26: 3  |███
Day 27: 3  |███
Day 28: 2  |██
Day 29: 2  |██
Day 30: 2  |██
```

---

## 📅 Yearly Plan (year)

### Part 1: Monthly Allocations (900 total)

**Monthly Allocation Pattern:**

```
Segment 1 (Months 1-3):   150/month = 450 images  ⭐⭐⭐ GENEROUS START
Segment 2 (Months 4-9):   Custom   = 360 images  📉 STRATEGIC DECLINE
  - Month 4:  80 images
  - Month 5:  70 images
  - Month 6:  60 images
  - Month 7:  55 images
  - Month 8:  50 images
  - Month 9:  45 images
Segment 3 (Months 10-12): 30/month  = 90 images   ✅ MODEST END
────────────────────────────────────────────────────────────────────
Total:                                 900 images
```

### Part 2: Daily Distribution WITHIN Each Month

**DIFFERENT from Monthly Plan!**

**Daily Distribution Pattern (for each month's allocation):**

```
Segment 1 (Days 1-3):    4 images/day  = 12 images   ⭐ MODERATE START
Segment 2 (Days 4-27):   3→1 declining = Variable   📉 GRADUAL
Segment 3 (Days 28-30):  1 image/day   = 3 images    ✅ MINIMAL END
```

**Example for Month 1 (150 images allocated):**
```
Day 1:  4  |████
Day 2:  4  |████
Day 3:  4  |████
Day 4:  3  |███
Day 5:  3  |███
Day 6:  3  |███
...
Day 25: 2  |██
Day 26: 2  |██
Day 27: 1  |█
Day 28: 1  |█
Day 29: 1  |█
Day 30: 1  |█
Total: 150 images
```

**Example for Month 5 (70 images allocated):**
```
Day 1:  4  |████
Day 2:  4  |████
Day 3:  4  |████
Day 4:  3  |███
Day 5:  3  |███
...
Day 25: 1  |█
Day 26: 1  |█
Day 27: 1  |█
Day 28: 1  |█
Day 29: 1  |█
Day 30: 1  |█
Total: 70 images
```

---

## 🔄 Comparison Table

### Daily Distribution Patterns

| Aspect | Monthly Plan | Yearly Plan (within month) |
|--------|--------------|---------------------------|
| **First 3 days** | 8 images/day | 4 images/day |
| **Middle pattern** | 6→3 (declining) | 3→1 (declining) |
| **Last 3 days** | 2 images/day | 1 image/day |
| **Total quota** | 150 (fixed) | Variable by month (150, 80, 70, 60, 55, 50, 45, 30) |
| **Generosity** | Higher daily | Lower daily |

### Why Different?

**Monthly Plan:**
- Standalone subscription
- Higher daily allocations
- Better daily experience
- Total: 150 images in 30 days

**Yearly Plan:**
- Part of larger yearly subscription
- Lower daily but more months
- Balanced across 12 months
- Total: 900 images in 12 months

---

## 🧪 Testing Examples

### Test Monthly Plan

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test_monthly",
    "is_premium": true,
    "purchase_id": "MONTH_001",
    "plan_type": "month",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2026-08-31T00:00:00Z"
  }'
```

**Expected Day 1 Response:**
```json
{
  "subscription": {
    "plan_type": "month",
    "total_quota": 150,
    "allocated_today": 8,    ← Monthly: 8/day first 3 days
    "today_remaining": 8,
    "current_day": 1
  }
}
```

---

### Test Yearly Plan - Month 1

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test_yearly",
    "is_premium": true,
    "purchase_id": "YEAR_001",
    "plan_type": "year",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2027-08-01T00:00:00Z"
  }'
```

**Expected Day 1 of Month 1 Response:**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 900,
    "current_month": 1,
    "current_month_allocated": 150,   ← Month 1: 150 total
    "allocated_today": 4,             ← Yearly: 4/day first 3 days
    "today_remaining": 4,
    "current_day": 1
  }
}
```

---

### Test Yearly Plan - Month 5

**Expected Day 1 of Month 5 Response:**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 550,
    "current_month": 5,
    "current_month_allocated": 70,    ← Month 5: 70 total
    "allocated_today": 4,             ← Still 4/day first 3 days
    "today_remaining": 4,
    "current_day": 1
  }
}
```

---

## 📋 Quick Reference

### Monthly Plan (Standalone)
```
Plan: month / month150
Total: 150 images / 30 days
Daily: 8→6→3→2 (HIGH to LOW)
First day: 8 images
Last day: 2 images
```

### Yearly Plan (12 Months)
```
Plan: year
Total: 900 images / 12 months

Monthly Allocation:
- Months 1-3:  150 each
- Months 4-9:  80, 70, 60, 55, 50, 45
- Months 10-12: 30 each

Daily Within Each Month:
- Pattern: 4→3→1 (MODERATE to MINIMAL)
- First day: 4 images
- Last day: 1 image
```

---

## 🎨 Visual Comparison

### Monthly Plan - Day 1 vs Yearly Plan - Day 1

```
Monthly Plan (Day 1):     Yearly Plan (Day 1):
8 images                  4 images

████████                  ████
████████                  ████

Higher daily allocation   Moderate daily allocation
for standalone month      spread across year
```

---

## ⚙️ Technical Implementation

### Plan Type Handling

```javascript
// segment-distribution.service.js

// Monthly plans use this pattern
if (normalized === 'month' || normalized === 'month150') {
    return generateMonth150Distribution(
        remainingQuota,
        remainingPeriods,
        currentDay
    );
    // Returns: [8, 8, 8, 6, 6, ..., 2, 2, 2]
}

// Yearly plan uses different pattern for daily distribution
if (normalized === 'year') {
    return generateYearlyDailyDistribution(
        remainingQuota,
        remainingPeriods,
        currentDay
    );
    // Returns: [4, 4, 4, 3, 3, ..., 1, 1, 1]
}
```

---

## ✅ Summary

| Feature | Monthly Plan | Yearly Plan |
|---------|-------------|-------------|
| **Total Images** | 150 | 900 |
| **Duration** | 30 days | 12 months |
| **Monthly Allocation** | N/A (all at once) | Segmented (150→80→30) |
| **Daily Pattern** | 8→6→3→2 | 4→3→1 |
| **First Day** | 8 images | 4 images |
| **Last Day** | 2 images | 1 image |
| **Use Case** | Standalone month | Long-term yearly |

---

**Last Updated**: August 3, 2026  
**Status**: ✅ Both patterns implemented and ready
