"""
HVAC Portfolio — DuckDB Ingestion & Aggregation Pipeline
=========================================================
Day 1 script: Reads 10 raw CSVs, applies cleaning fixes, computes
aggregated summary tables with key formulas, and outputs a single
hvac_portfolio.duckdb file for the agent to query.

Cleaning applied:
  - Role name standardization (33 variants → 12 canonical roles)
  - Date format normalization (slash dates in RFIs → YYYY-MM-DD)
  - Deduplication (labor log_ids, field note note_ids)
  - Mixed-type column fixes (billing_line_items)

Aggregated tables created:
  - labor_summary: by project + sov_line + role, with labor cost formula
  - material_summary: by project + sov_line
  - billing_summary: by project
  - change_order_summary: by project + status
  - project_health: master table with all 4 key formulas per project
"""

import duckdb
import os
import sys

# ── Config ──────────────────────────────────────────────────────────────────
# Adjust these paths as needed
DATA_DIR = os.environ.get("DATA_DIR", "./datasets")
OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "./hvac_portfolio.duckdb")

# ── Role mapping (33 variants → 12 canonical) ──────────────────────────────
ROLE_MAP = {
    "Journeyman Pipefitter": "Journeyman Pipefitter",
    "JM Pipefitter": "Journeyman Pipefitter",
    "J. Pipefitter": "Journeyman Pipefitter",
    "Pipefitter JM": "Journeyman Pipefitter",
    "Journeyman P.F.": "Journeyman Pipefitter",

    "Journeyman Sheet Metal": "Journeyman Sheet Metal",
    "Sheet Metal JM": "Journeyman Sheet Metal",
    "JM Sheet Metal": "Journeyman Sheet Metal",
    "J. Sheet Metal": "Journeyman Sheet Metal",
    "Journeyman S.M.": "Journeyman Sheet Metal",

    "Apprentice 2nd Year": "Apprentice 2nd Year",
    "Apprentice 2nd Yr": "Apprentice 2nd Year",
    "App 2nd Year": "Apprentice 2nd Year",
    "Apprentice - 2nd": "Apprentice 2nd Year",

    "Apprentice 4th Year": "Apprentice 4th Year",
    "Apprentice 4th Yr": "Apprentice 4th Year",
    "App 4th Year": "Apprentice 4th Year",
    "Apprentice - 4th": "Apprentice 4th Year",
    "4th Yr Apprentice": "Apprentice 4th Year",

    "Helper/Laborer": "Helper/Laborer",
    "Helper": "Helper/Laborer",

    "Foreman": "Foreman",
    "Fmn": "Foreman",
    "Lead Foreman": "Lead Foreman",
    "General Foreman": "General Foreman",

    "Controls Technician": "Controls Technician",
    "Controls Tech": "Controls Technician",
    "DDC Tech": "Controls Technician",
    "Ctrl Technician": "Controls Technician",
    "Controls Specialist": "Controls Technician",

    "Insulator": "Insulator",

    "Apprentice 3rd Year": "Apprentice 3rd Year",
    "Apprentice Controls": "Apprentice Controls",
}


def main():
    # Remove existing db if present
    if os.path.exists(OUTPUT_PATH):
        os.remove(OUTPUT_PATH)

    con = duckdb.connect(OUTPUT_PATH)
    log = {}  # cleaning log

    print("=" * 70)
    print("HVAC Portfolio — DuckDB Ingestion Pipeline")
    print("=" * 70)

    # ── Step 1: Load raw tables ─────────────────────────────────────────
    print("\n[1/6] Loading raw CSV files into DuckDB...")

    # Simple tables — load directly
    simple_tables = {
        "contracts": "contracts_all.csv",
        "sov": "sov_all.csv",
        "sov_budget": "sov_budget_all.csv",
        "billing_history": "billing_history_all.csv",
        "change_orders": "change_orders_all.csv",
        "material_deliveries": "material_deliveries_all.csv",
        "field_notes": "field_notes_all.csv",
    }

    for table_name, filename in simple_tables.items():
        filepath = os.path.join(DATA_DIR, filename)
        con.execute(f"""
            CREATE TABLE {table_name} AS
            SELECT * FROM read_csv_auto('{filepath}', all_varchar=false)
        """)
        count = con.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
        print(f"  {table_name:30s} — {count:>10,} rows")

    # billing_line_items — force mixed-type columns to proper types
    filepath = os.path.join(DATA_DIR, "billing_line_items_all.csv")
    con.execute(f"""
        CREATE TABLE billing_line_items AS
        SELECT
            sov_line_id,
            description,
            CAST(scheduled_value AS BIGINT) AS scheduled_value,
            CAST(previous_billed AS BIGINT) AS previous_billed,
            CAST(this_period AS BIGINT) AS this_period,
            CAST(total_billed AS BIGINT) AS total_billed,
            CAST(pct_complete AS DOUBLE) AS pct_complete,
            CAST(balance_to_finish AS BIGINT) AS balance_to_finish,
            project_id,
            CAST(application_number AS INTEGER) AS application_number
        FROM read_csv_auto('{filepath}', all_varchar=true)
    """)
    count = con.execute("SELECT COUNT(*) FROM billing_line_items").fetchone()[0]
    print(f"  {'billing_line_items':30s} — {count:>10,} rows")

    # ── Step 2: Load & clean labor_logs ─────────────────────────────────
    print("\n[2/6] Loading labor_logs with role standardization & dedup...")

    filepath = os.path.join(DATA_DIR, "labor_logs_all.csv")

    # Create the role mapping table
    con.execute("CREATE TABLE role_map (original VARCHAR, canonical VARCHAR)")
    for original, canonical in ROLE_MAP.items():
        con.execute(
            "INSERT INTO role_map VALUES (?, ?)", [original, canonical]
        )

    # Load labor logs, join with role map, deduplicate
    con.execute(f"""
        CREATE TABLE labor_logs AS
        WITH raw AS (
            SELECT * FROM read_csv_auto('{filepath}', all_varchar=false)
        ),
        deduped AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY log_id ORDER BY date) AS rn
            FROM raw
        )
        SELECT
            d.project_id,
            d.log_id,
            d.date,
            d.employee_id,
            COALESCE(rm.canonical, d.role) AS role,
            d.role AS role_original,
            d.sov_line_id,
            d.hours_st,
            d.hours_ot,
            d.hourly_rate,
            d.burden_multiplier,
            d.work_area,
            d.cost_code
        FROM deduped d
        LEFT JOIN role_map rm ON d.role = rm.original
        WHERE d.rn = 1
    """)

    total_raw = con.execute(f"SELECT COUNT(*) FROM read_csv_auto('{filepath}')").fetchone()[0]
    total_clean = con.execute("SELECT COUNT(*) FROM labor_logs").fetchone()[0]
    dupes_removed = total_raw - total_clean
    roles_before = con.execute(f"SELECT COUNT(DISTINCT role) FROM read_csv_auto('{filepath}')").fetchone()[0]
    roles_after = con.execute("SELECT COUNT(DISTINCT role) FROM labor_logs").fetchone()[0]

    print(f"  labor_logs loaded: {total_raw:,} raw → {total_clean:,} after dedup ({dupes_removed:,} duplicates removed)")
    print(f"  Roles standardized: {roles_before} variants → {roles_after} canonical")

    log["labor_dupes_removed"] = dupes_removed
    log["roles_before"] = roles_before
    log["roles_after"] = roles_after

    # ── Step 3: Fix RFI dates ───────────────────────────────────────────
    print("\n[3/6] Fixing mixed date formats in RFIs...")

    filepath = os.path.join(DATA_DIR, "rfis_all.csv")

    # Count slash dates in raw file first
    slash_count_before = con.execute(f"""
        SELECT COUNT(*) FROM read_csv_auto('{filepath}', all_varchar=true)
        WHERE date_submitted LIKE '%/%'
    """).fetchone()[0]

    con.execute(f"""
        CREATE TABLE rfis AS
        SELECT
            project_id,
            rfi_number,
            CASE
                WHEN date_submitted LIKE '%/%' THEN
                    strftime(
                        strptime(date_submitted, '%m/%d/%Y'),
                        '%Y-%m-%d'
                    )
                ELSE date_submitted
            END AS date_submitted,
            subject,
            submitted_by,
            assigned_to,
            priority,
            status,
            date_required,
            date_responded,
            response_summary,
            cost_impact,
            schedule_impact
        FROM read_csv_auto('{filepath}', all_varchar=true)
    """)

    slash_count_after = con.execute("""
        SELECT COUNT(*) FROM rfis WHERE date_submitted LIKE '%/%'
    """).fetchone()[0]

    rfis_count = con.execute("SELECT COUNT(*) FROM rfis").fetchone()[0]
    print(f"  rfis loaded: {rfis_count:,} rows")
    print(f"  Slash dates fixed: {slash_count_before} → {slash_count_after} remaining")

    log["rfi_slash_dates_fixed"] = slash_count_before

    # ── Dedup field_notes ───────────────────────────────────────────────
    print("\n  Deduplicating field_notes...")
    fn_before = con.execute("SELECT COUNT(*) FROM field_notes").fetchone()[0]
    con.execute("""
        CREATE TABLE field_notes_clean AS
        WITH ranked AS (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY note_id ORDER BY date) AS rn
            FROM field_notes
        )
        SELECT project_id, note_id, date, author, note_type, content,
               photos_attached, weather, temp_high, temp_low
        FROM ranked WHERE rn = 1
    """)
    con.execute("DROP TABLE field_notes")
    con.execute("ALTER TABLE field_notes_clean RENAME TO field_notes")
    fn_after = con.execute("SELECT COUNT(*) FROM field_notes").fetchone()[0]
    print(f"  field_notes deduped: {fn_before:,} → {fn_after:,} ({fn_before - fn_after} duplicates removed)")

    log["field_notes_dupes_removed"] = fn_before - fn_after

    # ── Step 4: Create aggregated summary tables ────────────────────────
    print("\n[4/6] Creating aggregated summary tables...")

    # 4a. Labor summary — by project + sov_line (~6K rows, matches instructions)
    #     Applies formula: (hours_st + hours_ot * 1.5) * hourly_rate * burden_multiplier
    con.execute("""
        CREATE TABLE labor_summary AS
        SELECT
            project_id,
            sov_line_id,
            COUNT(*) AS log_count,
            SUM(hours_st) AS total_hours_st,
            SUM(hours_ot) AS total_hours_ot,
            SUM(hours_st + hours_ot) AS total_hours,
            ROUND(AVG(hourly_rate), 2) AS avg_hourly_rate,
            ROUND(AVG(burden_multiplier), 3) AS avg_burden_multiplier,
            ROUND(SUM((hours_st + hours_ot * 1.5) * hourly_rate * burden_multiplier), 2) AS actual_labor_cost
        FROM labor_logs
        GROUP BY project_id, sov_line_id
    """)
    ls_count = con.execute("SELECT COUNT(*) FROM labor_summary").fetchone()[0]
    print(f"  labor_summary: {ls_count:,} rows (project + sov_line)")

    # 4b. Material summary — by project + sov_line
    con.execute("""
        CREATE TABLE material_summary AS
        SELECT
            project_id,
            sov_line_id,
            COUNT(*) AS delivery_count,
            SUM(quantity) AS total_quantity,
            ROUND(SUM(total_cost), 2) AS actual_material_cost
        FROM material_deliveries
        GROUP BY project_id, sov_line_id
    """)
    ms_count = con.execute("SELECT COUNT(*) FROM material_summary").fetchone()[0]
    print(f"  material_summary: {ms_count:,} rows (project + sov_line)")

    # 4c. Billing summary — latest billing snapshot per project
    con.execute("""
        CREATE TABLE billing_summary AS
        WITH latest_app AS (
            SELECT
                project_id,
                MAX(application_number) AS latest_app_number
            FROM billing_history
            GROUP BY project_id
        ),
        latest_billing AS (
            SELECT bh.*
            FROM billing_history bh
            JOIN latest_app la
                ON bh.project_id = la.project_id
                AND bh.application_number = la.latest_app_number
        ),
        line_item_agg AS (
            SELECT
                bli.project_id,
                bli.application_number,
                ROUND(AVG(bli.pct_complete), 2) AS avg_pct_complete,
                SUM(bli.total_billed) AS total_billed_lines,
                SUM(bli.balance_to_finish) AS total_balance_to_finish
            FROM billing_line_items bli
            JOIN latest_app la
                ON bli.project_id = la.project_id
                AND bli.application_number = la.latest_app_number
            GROUP BY bli.project_id, bli.application_number
        )
        SELECT
            lb.project_id,
            lb.application_number AS latest_application,
            lb.period_end AS latest_period_end,
            lb.cumulative_billed,
            lb.retention_held,
            lb.net_payment_due,
            lb.status AS payment_status,
            lb.payment_date,
            lia.avg_pct_complete,
            lia.total_billed_lines,
            lia.total_balance_to_finish
        FROM latest_billing lb
        LEFT JOIN line_item_agg lia
            ON lb.project_id = lia.project_id
    """)
    bs_count = con.execute("SELECT COUNT(*) FROM billing_summary").fetchone()[0]
    print(f"  billing_summary: {bs_count:,} rows (latest snapshot per project)")

    # 4d. Change order summary — by project + status
    con.execute("""
        CREATE TABLE change_order_summary AS
        SELECT
            project_id,
            status,
            COUNT(*) AS co_count,
            SUM(amount) AS total_amount,
            SUM(labor_hours_impact) AS total_labor_hours_impact,
            SUM(schedule_impact_days) AS total_schedule_impact_days
        FROM change_orders
        GROUP BY project_id, status
    """)
    cos_count = con.execute("SELECT COUNT(*) FROM change_order_summary").fetchone()[0]
    print(f"  change_order_summary: {cos_count:,} rows (project + status)")

    # ── Step 5: Master project_health table with all 4 formulas ─────────
    print("\n[5/6] Computing project_health table (4 key formulas)...")

    con.execute("""
        CREATE TABLE project_health AS
        WITH
        -- Actual labor cost per project
        labor_agg AS (
            SELECT project_id,
                   ROUND(SUM(actual_labor_cost), 2) AS actual_labor_cost,
                   SUM(total_hours_st) AS total_hours_st,
                   SUM(total_hours_ot) AS total_hours_ot
            FROM labor_summary
            GROUP BY project_id
        ),
        -- Actual material cost per project
        material_agg AS (
            SELECT project_id,
                   ROUND(SUM(actual_material_cost), 2) AS actual_material_cost
            FROM material_summary
            GROUP BY project_id
        ),
        -- Budget totals per project (from sov_budget)
        budget_agg AS (
            SELECT project_id,
                   SUM(estimated_labor_cost) AS budgeted_labor_cost,
                   SUM(estimated_material_cost) AS budgeted_material_cost,
                   SUM(estimated_equipment_cost) AS budgeted_equipment_cost,
                   SUM(estimated_sub_cost) AS budgeted_sub_cost,
                   SUM(estimated_labor_hours) AS budgeted_labor_hours,
                   SUM(estimated_labor_cost + estimated_material_cost
                       + estimated_equipment_cost + estimated_sub_cost) AS total_estimated_budget
            FROM sov_budget
            GROUP BY project_id
        ),
        -- Approved change order value per project
        co_approved AS (
            SELECT project_id,
                   SUM(total_amount) AS approved_co_value
            FROM change_order_summary
            WHERE status = 'Approved'
            GROUP BY project_id
        ),
        -- Pending change order value per project
        co_pending AS (
            SELECT project_id,
                   SUM(total_amount) AS pending_co_value
            FROM change_order_summary
            WHERE status = 'Pending'
            GROUP BY project_id
        )
        SELECT
            c.project_id,
            c.project_name,
            c.original_contract_value,
            c.contract_date,
            c.substantial_completion_date,
            c.gc_name,

            -- Adjusted contract value (original + approved COs)
            c.original_contract_value + COALESCE(co_a.approved_co_value, 0)
                AS adjusted_contract_value,

            -- Actual costs
            COALESCE(la.actual_labor_cost, 0) AS actual_labor_cost,
            COALESCE(ma.actual_material_cost, 0) AS actual_material_cost,
            COALESCE(la.actual_labor_cost, 0) + COALESCE(ma.actual_material_cost, 0)
                AS actual_total_cost,

            -- Budgeted costs
            COALESCE(ba.budgeted_labor_cost, 0) AS budgeted_labor_cost,
            COALESCE(ba.budgeted_material_cost, 0) AS budgeted_material_cost,
            COALESCE(ba.total_estimated_budget, 0) AS total_estimated_budget,
            COALESCE(ba.budgeted_labor_hours, 0) AS budgeted_labor_hours,

            -- Actual hours
            COALESCE(la.total_hours_st, 0) AS actual_hours_st,
            COALESCE(la.total_hours_ot, 0) AS actual_hours_ot,

            -- Change orders
            COALESCE(co_a.approved_co_value, 0) AS approved_co_value,
            COALESCE(co_p.pending_co_value, 0) AS pending_co_value,

            -- Billing
            COALESCE(bs.cumulative_billed, 0) AS cumulative_billed,
            COALESCE(bs.retention_held, 0) AS retention_held,
            COALESCE(bs.avg_pct_complete, 0) AS avg_pct_complete,

            -- ═══ KEY FORMULA 1: Variance (Actual Cost - Budget) ═══
            COALESCE(la.actual_labor_cost, 0) - COALESCE(ba.budgeted_labor_cost, 0)
                AS labor_variance,
            COALESCE(ma.actual_material_cost, 0) - COALESCE(ba.budgeted_material_cost, 0)
                AS material_variance,
            (COALESCE(la.actual_labor_cost, 0) + COALESCE(ma.actual_material_cost, 0))
                - COALESCE(ba.total_estimated_budget, 0)
                AS total_variance,

            -- ═══ KEY FORMULA 2: Budget Coverage (Estimated Budget / Contract Value) ═══
            CASE WHEN c.original_contract_value > 0
                THEN ROUND(COALESCE(ba.total_estimated_budget, 0) * 100.0
                     / c.original_contract_value, 2)
                ELSE NULL
            END AS budget_coverage_pct,

            -- ═══ KEY FORMULA 3: Billing Gap (% Complete - % Billed) ═══
            CASE WHEN c.original_contract_value + COALESCE(co_a.approved_co_value, 0) > 0
                THEN ROUND(
                    COALESCE(bs.avg_pct_complete, 0)
                    - (COALESCE(bs.cumulative_billed, 0) * 100.0
                       / (c.original_contract_value + COALESCE(co_a.approved_co_value, 0))),
                    2)
                ELSE NULL
            END AS billing_gap_pct,

            -- ═══ KEY FORMULA 4: Realized Margin ═══
            -- (Adjusted Contract Value - Actual Total Cost) / Adjusted Contract Value
            CASE WHEN c.original_contract_value + COALESCE(co_a.approved_co_value, 0) > 0
                THEN ROUND(
                    ((c.original_contract_value + COALESCE(co_a.approved_co_value, 0))
                     - (COALESCE(la.actual_labor_cost, 0) + COALESCE(ma.actual_material_cost, 0)))
                    * 100.0
                    / (c.original_contract_value + COALESCE(co_a.approved_co_value, 0)),
                    2)
                ELSE NULL
            END AS realized_margin_pct

        FROM contracts c
        LEFT JOIN labor_agg la ON c.project_id = la.project_id
        LEFT JOIN material_agg ma ON c.project_id = ma.project_id
        LEFT JOIN budget_agg ba ON c.project_id = ba.project_id
        LEFT JOIN co_approved co_a ON c.project_id = co_a.project_id
        LEFT JOIN co_pending co_p ON c.project_id = co_p.project_id
        LEFT JOIN billing_summary bs ON c.project_id = bs.project_id
    """)

    ph_count = con.execute("SELECT COUNT(*) FROM project_health").fetchone()[0]
    print(f"  project_health: {ph_count:,} rows (one per project)")

    # ── Step 6: Spot checks & verification ──────────────────────────────
    print("\n[6/6] Verification & spot checks...")

    # Check: project_health should have 405 rows
    assert ph_count == 405, f"Expected 405 projects, got {ph_count}"
    print(f"  ✓ project_health has 405 rows")

    # Check: SOV values sum ≈ contract values
    sov_check = con.execute("""
        SELECT
            COUNT(*) AS projects_checked,
            SUM(CASE WHEN ABS(sov_total - contract_value) > 1 THEN 1 ELSE 0 END) AS mismatches
        FROM (
            SELECT
                c.project_id,
                c.original_contract_value AS contract_value,
                COALESCE(s.sov_total, 0) AS sov_total
            FROM contracts c
            LEFT JOIN (
                SELECT project_id, SUM(scheduled_value) AS sov_total
                FROM sov
                GROUP BY project_id
            ) s ON c.project_id = s.project_id
        )
    """).fetchone()
    print(f"  ✓ SOV vs contract value: {sov_check[1]} mismatches out of {sov_check[0]} projects")

    # Check: no unmapped roles left
    unmapped = con.execute("""
        SELECT COUNT(DISTINCT role) FROM labor_logs
        WHERE role NOT IN (SELECT DISTINCT canonical FROM role_map)
    """).fetchone()[0]
    print(f"  ✓ Unmapped roles remaining: {unmapped}")

    # Check: no slash dates left in RFIs
    slash_remaining = con.execute("""
        SELECT COUNT(*) FROM rfis WHERE date_submitted LIKE '%/%'
    """).fetchone()[0]
    print(f"  ✓ Slash dates remaining in RFIs: {slash_remaining}")

    # Spot check: top 5 worst-margin projects
    print("\n  Top 5 worst realized margin projects:")
    worst = con.execute("""
        SELECT project_id, project_name,
               original_contract_value, actual_total_cost,
               realized_margin_pct
        FROM project_health
        ORDER BY realized_margin_pct ASC
        LIMIT 5
    """).fetchall()
    for row in worst:
        print(f"    {row[0]} | {row[1][:40]:40s} | Contract: ${row[2]:>12,} | Actual: ${row[3]:>12,.0f} | Margin: {row[4]:>7.1f}%")

    # Spot check: random rows from different cohorts
    print("\n  Random spot checks across cohorts:")
    for cohort in ["2018", "2020", "2022", "2024"]:
        sample = con.execute(f"""
            SELECT project_id, realized_margin_pct, budget_coverage_pct,
                   billing_gap_pct, actual_labor_cost, budgeted_labor_cost
            FROM project_health
            WHERE project_id LIKE 'PRJ-{cohort}-%'
            ORDER BY RANDOM()
            LIMIT 1
        """).fetchone()
        if sample:
            print(f"    {sample[0]} | Margin: {sample[1]:>6.1f}% | Budget Cov: {sample[2]:>6.1f}% | Billing Gap: {sample[3]:>6.1f}% | Labor: ${sample[4]:>10,.0f} vs ${sample[5]:>10,} budgeted")

    # ── Final summary ───────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("CLEANING SUMMARY")
    print("=" * 70)

    tables = con.execute("SHOW TABLES").fetchall()
    print(f"\nTables in database ({len(tables)}):")
    for t in tables:
        count = con.execute(f"SELECT COUNT(*) FROM {t[0]}").fetchone()[0]
        print(f"  {t[0]:30s} — {count:>10,} rows")

    print(f"\nFixes applied:")
    print(f"  Role variants mapped: {log['roles_before']} → {log['roles_after']}")
    print(f"  Labor log duplicates removed: {log['labor_dupes_removed']:,}")
    print(f"  Field note duplicates removed: {log['field_notes_dupes_removed']}")
    print(f"  RFI slash dates fixed: {log['rfi_slash_dates_fixed']}")

    db_size = os.path.getsize(OUTPUT_PATH) / (1024 * 1024)
    print(f"\nOutput: {OUTPUT_PATH} ({db_size:.1f} MB)")
    print("=" * 70)

    con.close()
    print("\nDone! ✓")


if __name__ == "__main__":
    main()
