# Yearly Plan - Dynamic Daily Distribution

## 🎯 Formula

```javascript
today_allocated = ceil(current_month_remaining / remaining_days_in_month)
```

Where:
- `current_month_remaining` = Unused images in current month
- `remaining_days_in_month` = Days left including today
- `ceil()` = Round up to nearest integer

---

## 📊 How It Works

### Monthly Allocation
```
Month 1:  150
Month 2:  150
Month 3:  150
Month 4:  80
Month 5:  70
Month 6:  60
Month 7:  55
Month 8:  50
Month 9:  45
Month 10: 30
Month 11: 30
Month 12: 30
```

### Carry-Forward
```
carry_forward = (previous months allocated) - (previous months used)
current_month_available = current_month_allocated + carry_forward
```

### Daily Distribution
```
Each day:
  remaining_days = days_left_in_month_including_today
  today_allocated = ceil(current_month_remaining / remaining_days)
  
Next day:
  Recalculate based on new remaining and new days_left
```

---

## 🧮 Example: Month 4 with 530 Images

### Setup
```
Month 4 Allocation: 80
Carry Forward: 450
Current Month Available: 530
Days in Month: 30
```

### Day-by-Day (No Usage Scenario)

```
Day 1:
  remaining_days = 30
  today_allocated = ceil(530 / 30) = ceil(17.67) = 18
  if used 0: remaining = 530

Day 2:
  remaining_days = 29
  today_allocated = ceil(530 / 29) = ceil(18.28) = 19
  if used 0: remaining = 530

Day 3:
  remaining_days = 28
  today_allocated = ceil(530 / 28) = ceil(18.93) = 19
  if used 0: remaining = 530

...continues...

Day 28:
  remaining_days = 3
  today_allocated = ceil(530 / 3) = ceil(176.67) = 177
  
Day 29:
  remaining_days = 2
  today_allocated = ceil(530 / 2) = ceil(265) = 265
  
Day 30:
  remaining_days = 1
  today_allocated = ceil(530 / 1) = 530 (all remaining)
```

---

## 🧮 Example: With Progressive Usage

### Setup
```
Month 4 Allocation: 80
Carry Forward: 450
Initial Available: 530
```

### Day-by-Day Calculation

```
Day 1:
  current_month_remaining = 530
  remaining_days = 30
  today_allocated = ceil(530 / 30) = 18
  used = 10
  new remaining = 530 - 10 = 520

Day 2:
  current_month_remaining = 520
  remaining_days = 29
  today_allocated = ceil(520 / 29) = 18
  used = 15
  new remaining = 520 - 15 = 505

Day 3:
  current_month_remaining = 505
  remaining_days = 28
  today_allocated = ceil(505 / 28) = 19
  used = 19 (all used)
  new remaining = 505 - 19 = 486

Day 4:
  current_month_remaining = 486
  remaining_days = 27
  today_allocated = ceil(486 / 27) = 18
  used = 0 (not used)
  new remaining = 486

Day 5:
  current_month_remaining = 486
  remaining_days = 26
  today_allocated = ceil(486 / 26) = 19
  used = 5
  new remaining = 486 - 5 = 481
```

---

## 📊 Key Characteristics

### 1. Dynamic Recalculation
- Every day recalculates based on what's left
- Adapts to user's actual usage pattern
- No fixed daily amount

### 2. Ensures Full Unlock
- By day 30 (last day), all remaining images available
- `remaining_days = 1` → `today_allocated = all remaining`

### 3. Unused Images Persist
- If user doesn't use today's allocation, it stays in `current_month_remaining`
- Next day's calculation includes it
- Eventually carries to next month if never used

### 4. Ceiling Function
- Always rounds up
- Ensures small remainders don't get lost
- Example: 17.3 → 18, not 17

---

## 🧪 Test Scenarios

### Scenario 1: No Usage (Maximum Carry)

```
Day 1:  Allocated: 18, Used: 0, Remaining: 530
Day 2:  Allocated: 19, Used: 0, Remaining: 530
Day 3:  Allocated: 19, Used: 0, Remaining: 530
...
Day 30: Allocated: 530, Used: 0, Remaining: 530

Next Month:
  Carry Forward: 530 (all carried)
  New Month Allocation: 70
  Available: 600
```

---

### Scenario 2: Heavy Early Usage

```
Day 1:  Allocated: 18, Used: 18, Remaining: 512
Day 2:  Allocated: 18, Used: 18, Remaining: 494
        (ceil(512/29) = 18)
Day 3:  Allocated: 18, Used: 18, Remaining: 476
        (ceil(494/28) = 18)
Day 4:  Allocated: 18, Used: 18, Remaining: 458
        (ceil(476/27) = 18)
...continues...

Day 28: All 530 used
Day 29: Allocated: 0, No images left
Day 30: Allocated: 0, No images left
```

---

### Scenario 3: Irregular Usage

```
Day 1:  Allocated: 18, Used: 5,  Remaining: 525
Day 2:  Allocated: 19, Used: 0,  Remaining: 525
        (ceil(525/29) = 19)
Day 3:  Allocated: 19, Used: 19, Remaining: 506
        (ceil(525/28) = 19)
Day 4:  Allocated: 19, Used: 10, Remaining: 496
        (ceil(506/27) = 19)
Day 5:  Allocated: 19, Used: 19, Remaining: 477
        (ceil(496/26) = 20, but used 19)
```

---

## 📋 API Response Format

### Day 1 of Month 4 (530 available)

```json
{
  "subscription": {
    "plan_type": "year",
    "total_quota": 900,
    "remaining_quota": 700,
    
    "current_month": 4,
    "current_month_allocated": 80,
    "current_month_carry_forward": 450,
    "current_month_available": 530,
    "current_month_used": 0,
    "current_month_remaining": 530,
    
    "today_allocated": 18,           // ceil(530/30)
    "today_used": 0,
    "today_remaining": 18,
    
    "image_generation": true
  }
}
```

### Day 15 of Month 4 (400 remaining, 16 days left)

```json
{
  "current_month": 4,
  "current_month_remaining": 400,
  
  "today_allocated": 25,           // ceil(400/16)
  "today_used": 0,
  "today_remaining": 25
}
```

### Day 30 of Month 4 (200 remaining, 1 day left)

```json
{
  "current_month": 4,
  "current_month_remaining": 200,
  
  "today_allocated": 200,          // ceil(200/1) = all remaining
  "today_used": 0,
  "today_remaining": 200
}
```

---

## 🔧 Implementation

### Key Functions

**1. `getRemainingDaysInMonth(now)`**
```javascript
function getRemainingDaysInMonth(now = new Date()) {
    const today = new Date(now);
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    
    // Last day of current month
    const lastDayOfMonth = new Date(Date.UTC(year, month + 1, 0));
    const lastDay = lastDayOfMonth.getUTCDate();
    
    // Current day
    const currentDay = today.getUTCDate();
    
    // Remaining days including today
    return lastDay - currentDay + 1;
}
```

**2. `ensureYearMonth(subscription)`**
```javascript
// Calculate remaining days
const remainingDaysInMonth = getRemainingDaysInMonth(now);

// Calculate today's allocation
const todayAllocation = Math.ceil(monthlyRemaining / remainingDaysInMonth);

// Create/update daily quota
await DailyQuota.findOneAndUpdate(
    { subscriptionId: subscription._id, date: todayKey },
    {
        allocatedQuota: todayAllocation,
        remainingQuota: todayAllocation - todayUsed
    },
    { upsert: true }
);
```

---

## ✅ Validation

### Rule 1: Dynamic Calculation
```javascript
today_allocated = ceil(current_month_remaining / remaining_days) ✅
```

### Rule 2: Adapts to Usage
```javascript
If user doesn't use images:
  next_day_allocated recalculates with same remaining ✅
```

### Rule 3: Full Unlock by Month End
```javascript
Day 30 (last day):
  remaining_days = 1
  today_allocated = current_month_remaining (all) ✅
```

### Rule 4: Non-Negative
```javascript
if current_month_remaining = 0:
  today_allocated = 0 ✅
```

---

## 📊 Comparison with Other Plans

| Aspect | Weekly | Monthly | Yearly |
|--------|--------|---------|--------|
| **Daily Pattern** | Fixed segment (8→6) | Fixed segment (8→6→3→2) | Dynamic (ceil(rem/days)) |
| **Predictable** | Yes | Yes | Adapts to usage |
| **Can use all Day 1?** | No | No | No (limited to 18) |
| **Unused carry?** | Yes (daily) | Yes (daily) | Yes (monthly) |
| **Formula** | Segment pattern | Segment pattern | Divide & ceil |

---

## 🧪 Test Commands

### Day 1 Test

```bash
curl -X POST http://localhost:3000/api/check-free-limit \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "year_dynamic",
    "is_premium": true,
    "purchase_id": "YEAR_DYN_001",
    "plan_type": "year",
    "purchase_date": "2026-08-01T00:00:00Z",
    "expiry_date": "2027-08-01T00:00:00Z"
  }'
```

**Expected (Month 1, Day 1, 30 days left):**
```json
{
  "current_month": 1,
  "current_month_allocated": 150,
  "current_month_carry_forward": 0,
  "current_month_remaining": 150,
  
  "today_allocated": 5,     // ceil(150/30)
  "today_remaining": 5
}
```

---

## ⚠️ Important Notes

1. **Weekly Plan**: Unchanged - uses fixed 8→6 pattern ✅
2. **Monthly Plan**: Unchanged - uses fixed 8→6→3→2 pattern ✅
3. **Yearly Plan**: Uses dynamic daily distribution ✅

4. **Why This Approach**:
   - Prevents hoarding (can't use all on day 1)
   - Encourages regular usage
   - Fair distribution across month
   - Adapts to actual behavior
   - Still allows carry-forward

5. **Edge Cases**:
   - Last day of month: All remaining allocated ✅
   - No images left: today_allocated = 0 ✅
   - Month with 28/29/30/31 days: Automatically handled ✅

---

## 📊 Summary

| Feature | Value |
|---------|-------|
| **Distribution Type** | Dynamic (not fixed) |
| **Formula** | `ceil(remaining / days_left)` |
| **Recalculates** | Every day |
| **Weekly/Monthly** | Unchanged ✅ |
| **Carry-Forward** | Yes (monthly) ✅ |

---

**Status**: ✅ Implemented  
**Formula**: `today_allocated = ceil(current_month_remaining / remaining_days_in_month)`  
**Last Updated**: August 3, 2026
