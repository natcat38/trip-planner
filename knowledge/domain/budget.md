---
type: Domain Entity
title: Budget
description: Money stored as integer minor units plus an explicit currency, rolled up by convert-on-read conversion.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [domain, money]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

⚠️ **Money is integer minor units + an explicit currency, never floats.** JPY has 0 decimals,
EUR has 2; a `currencyMeta` const carries the exponent per currency.

Roll-up over all costed [activities](/domain/itinerary.md) and `Expense` rows:

```
spentBase = Σ convert(costMinor, costCurrency → baseCurrency)
remaining = budgetMinor − spentBase
status    = spentBase > budgetMinor ? OVER : OK
```

- `convert()` uses a rates table refreshed daily from a rates API and cached; conversion happens
  **on read**, so editing rates never rewrites stored costs.
- If a currency has no rate yet: show the original amount, exclude from the converted total with
  a flag, retry on next refresh — never block the UI.

# Citations

[Tech Scope §2.3](../../docs/Trip_Planner_Tech_Scope.md).
