# Yearly Plan - Cumulative Carry-Forward Implementation

## 🎯 Overview

The Yearly plan (900 images / 12 months) now implements **cumulative carry-forward** where unused images from ALL previous months accumulate and carry forward to the current month.

### Key Changes

✅ **Cumulative Carry-Forward** - Unused images from all months accumulate  
✅ **Monthly Allocation** - Fixed allocation per month (150→80→30)  
✅ **Available Images** - Base + Cumulative Carry-Forward  
✅ **Never Expires** - Carries until used or subscription expires  
✅ **Capped at 900** - Never exceeds total yearly quota  

---

## 📊 Monthly Allocation Pattern

```
Month 1:  150 images
Month 2:  150 images
Month 3:  150 images
Month 4:  80 images
Month 5:  70 images
Month 6:  60 images
Month 7:  55 images
Month 8:  50 images
Month 9:  45 images
Month 10: 30 images
Month 11: 30 images
Month 12: 30 images
────────────────────
Total:    900 images ✅
```

---

## 🔄 Carry-Forward Logic

### How It Works

1. **Base Allocation**: Each month gets its fixed allocation
2. **Unused Images**: Any unused images from previous months
3. **Cumulative**: All unused from months 1, 2, 3... accumulate
4. **Available**: Current month = Base + Cumulative Carry-Forward
5. **Continues**: Until used or subscription expires

### Formula

```javascript
current_month_available = current_month_allocated + cumulative_carry_forward

Where:
- current_month_allocated = Fixed allocation for this month (150, 80, 70, etc.)
- cumulative_carry_forward = Sum of unused from ALL previous months
```

---

## 📋 Response Fields

### Yearly Plan Response

```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 900,
    
    "current_month": 1,
    "total_months": 12,
    
    "current_month_allocated": 150,        // Base allocation for Month 1
    "current_month_carry_forward": 0,     // No carry-forward yet
    "current_month_available": 150,       // 150 + 0 = 150
    "current_month_used": 0,
    "current_month_remaining": 150,       // 150 - 0 = 150
    
    "image_generation": true              // true if remaining > 0
  }
}
```

---

## 🧪 Test Scenarios

### Scenario 1: No Usage (Maximum Accumulation)

**User never uses any images - all carry forward**

```
Month 1:  Allocated: 150, Used: 0, Carry Forward: 0
          Available: 150
          
Month 2:  Allocated: 150, Used: 0, Carry Forward: 150
          Available: 150 + 150 = 300
          
Month 3:  Allocated: 150, Used: 0, Carry Forward: 300
          Available: 150 + 300 = 450
          
Month 4:  Allocated: 80, Used: 0, Carry Forward: 450
          Available: 80 + 450 = 530
          
Month 5:  Allocated: 70, Used: 0, Carry Forward: 530
          Available: 70 + 530 = 600
          
Month 6:  Allocated: 60, Used: 0, Carry Forward: 600
          Available: 60 + 600 = 660
          
Month 7:  Allocated: 55, Used: 0, Carry Forward: 660
          Available: 55 + 660 = 715
          
Month 8:  Allocated: 50, Used: 0, Carry Forward: 715
          Available: 50 + 715 = 765
          
Month 9:  Allocated: 45, Used: 0, Carry Forward: 765
          Available: 45 + 765 = 810
          
Month 10: Allocated: 30, Used: 0, Carry Forward: 810
          Available: 30 + 810 = 840
          
Month 11: Allocated: 30, Used: 0, Carry Forward: 840
          Available: 30 + 840 = 870
          
Month 12: Allocated: 30, Used: 0, Carry Forward: 870
          Available: 30 + 870 = 900 ✅
```

---

### Scenario 2: Partial Usage (Mixed)

**User uses some images each month**

```
Month 1:  Allocated: 150, Used: 100, Remaining: 50
          Carry Forward: 0
          
Month 2:  Allocated: 150, Used: 120, Remaining: 80
          Carry Forward: 50 (from Month 1)
          Available: 150 + 50 = 200
          After Use: 200 - 120 = 80
          
Month 3:  Allocated: 150, Used: 230, Remaining: 0
          Carry Forward: 80 (from Months 1-2)
          Available: 150 + 80 = 230
          After Use: 230 - 230 = 0 (all used)
          
Month 4:  Allocated: 80, Used: 50, Remaining: 30
          Carry Forward: 0 (all used in Month 3)
          Available: 80 + 0 = 80
          After Use: 80 - 50 = 30
          
Month 5:  Allocated: 70, Used: 0, Remaining: 100
          Carry Forward: 30 (from Month 4)
          Available: 70 + 30 = 100
          After Use: 100 - 0 = 100
          
Month 6:  Allocated: 60, Used: 160, Remaining: 0
          Carry Forward: 100 (from Months 4-5)
          Available: 60 + 100 = 160
          After Use: 160 - 160 = 0
```

---

### Scenario 3: Heavy Early Usage, Light Later

**User uses heavily in first 3 months, then lightly**

```
Month 1:  Allocated: 150, Used: 150, Remaining: 0
          Carry Forward: 0
          
Month 2:  Allocated: 150, Used: 150, Remaining: 0
          Carry Forward: 0
          Available: 150 + 0 = 150
          
Month 3:  Allocated: 150, Used: 150, Remaining: 0
          Carry Forward: 0
          Available: 150 + 0 = 150
          
Month 4:  Allocated: 80, Used: 10, Remaining: 70
          Carry Forward: 0
          Available: 80 + 0 = 80
          After Use: 80 - 10 = 70
          
Month 5:  Allocated: 70, Used: 10, Remaining: 130
          Carry Forward: 70 (from Month 4)
          Available: 70 + 70 = 140
          After Use: 140 - 10 = 130
          
Month 6:  Allocated: 60, Used: 10, Remaining: 180
          Carry Forward: 130 (from Months 4-5)
          Available: 60 + 130 = 190
          After Use: 190 - 10 = 180

...continues accumulating through Month 12
```

---

## 🧪 API Test Commands

### Month 1 - Fresh Start

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "year_cf_test",
    "is_premium": true,
    "purchase_id": "YEAR_CF_001",
    "plan_type": "year",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2027-08-01T00:00:00Z"
  }'
```

**Expected Response:**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 900,
    "current_month": 1,
    "current_month_allocated": 150,
    "current_month_carry_forward": 0,
    "current_month_available": 150,
    "current_month_used": 0,
    "current_month_remaining": 150
  }
}
```

---

### Month 2 - With Carry-Forward (Scenario: 50 unused from Month 1)

**Expected Response:**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 850,
    "current_month": 2,
    "current_month_allocated": 150,
    "current_month_carry_forward": 50,
    "current_month_available": 200,
    "current_month_used": 0,
    "current_month_remaining": 200
  }
}
```

---

### Month 5 - Cumulative Carry-Forward

**Expected Response (if 80 images carried from Months 1-4):**
```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 550,
    "current_month": 5,
    "current_month_allocated": 70,
    "current_month_carry_forward": 80,
    "current_month_available": 150,
    "current_month_used": 0,
    "current_month_remaining": 150
  }
}
```

---

## 📊 Validation Rules

### Rule 1: Never Exceed 900
```javascript
total_used + current_month_available <= 900 ✅
```

### Rule 2: Carry-Forward Accuracy
```javascript
cumulative_carry_forward = sum(all_previous_months.remaining)
```

### Rule 3: Available Calculation
```javascript
current_month_available = current_month_allocated + current_month_carry_forward
```

### Rule 4: Remaining Calculation
```javascript
current_month_remaining = current_month_available - current_month_used
```

### Rule 5: Image Generation
```javascript
image_generation = current_month_remaining > 0
```

---

## 🔧 Technical Implementation

### Key Functions

**1. `calculateYearlyCumulativeCarryForward(subscription, currentMonthKey)`**
- Finds all previous months
- Sums up their `remainingQuota`
- Returns cumulative total
- Clears daily quotas for completed months

**2. `ensureYearMonth(subscription)`**
- Gets cumulative carry-forward
- Adds base allocation
- Creates monthly quota with both values
- Triggers daily distribution

**3. `getRemainingQuota(subscription)`**
- Fetches monthly quota
- Extracts all fields
- Calculates `current_month_available`
- Returns complete response

---

## ⚠️ Important Notes

1. **Weekly/Monthly Plans Unchanged**
   - This only affects yearly plans
   - Other plans work as before

2. **Daily Distribution**
   - Within each month, daily pattern: 4→3→1
   - Different from standalone monthly plan (8→6→3→2)

3. **Capped at Total**
   - Available never exceeds remaining quota
   - Ensures 900 total limit is respected

4. **Automatic Accumulation**
   - No manual intervention needed
   - Happens automatically each month

5. **Persistent Until Expiry**
   - Carry-forward doesn't expire monthly
   - Only expires with subscription

---

## ✅ Summary

| Feature | Implementation |
|---------|----------------|
| **Monthly Allocation** | 150→80→30 (segmented) ✅ |
| **Carry-Forward Type** | Cumulative (all previous months) ✅ |
| **Max Accumulation** | 900 (total quota) ✅ |
| **Expiry** | Only when subscription expires ✅ |
| **Response Fields** | All 6 required fields included ✅ |
| **Weekly/Monthly** | Unchanged ✅ |
| **Tested** | All 12 months, multiple scenarios ✅ |

---

**Status**: ✅ Production Ready  
**Last Updated**: August 3, 2026  
**Affects**: Yearly plan only
