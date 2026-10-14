# Project Title — e.g. Sales Performance Dashboard

> **One-line summary:** what you built and the main finding.

**Tools:** Power BI · DAX · Power Query · SQL
**Industry:** Retail
**Links:** [Live dashboard](#) · [Dataset](#) · [SQL / notebook](#)

![Dashboard screenshot](../assets/project1.png)

---

## 1. Business problem
Who is asking, and what decision do they need to make?
> *Example: The sales manager wants to know why Q3 revenue dropped 12% and which regions or products to focus on.*

## 2. Data
- **Source:** (Kaggle / Maven Analytics / company open data, with link)
- **Size:** rows × columns, time period
- **Tables:** orders, customers, products, regions …
- **Cleaning steps:**
  - Removed duplicates (n = …)
  - Fixed date formats, handled missing values in …
  - Created calculated columns: …

## 3. Approach
- **Data model:** star schema (1 fact table + N dimension tables). Add a diagram screenshot here.
- **KPIs defined:**
  | KPI | Definition |
  |---|---|
  | Revenue | SUM(quantity × unit_price) |
  | Gross margin % | (Revenue − COGS) / Revenue |
  | YoY growth | (This year − Last year) / Last year |
- **Main techniques:** DAX time intelligence, window functions, drill-through …

## 4. Insights
1. **Insight with a number.** *e.g. 70% of the Q3 drop came from two product lines in the West region.*
2. …
3. …

## 5. Recommendations
1. **Action**: why, and the expected impact.
2. …
3. …

## 6. Limitations and next steps
- What the data couldn't answer
- What you would add with more time or data

## 7. What I learned
- One or two technical or business lessons from this project.
