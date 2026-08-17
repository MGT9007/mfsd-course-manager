# MFSD Course Manager ↔ Quest Log Integration — Architecture Specification v1.1

**Plugins affected:** `mfsd-ordering`, `mfsd-course-manager`, `mfsd-quest-log`
**Status:** Approved — ready for Linear tickets
**Author:** MTClaude (architecture), reviewed by Mark Taylor
**Purpose:** Make task-level badge/coin configuration data-driven from `wp_mfsd_task_order` instead of hardcoded PHP constants, so tasks can be added, removed, reordered, or re-weighted in any course — including the Foundation Course — entirely from the Course Manager admin UI, with Quest Log automatically reflecting the change. No plugin code changes required for day-to-day content operations.

---

## 1. Problem Statement

Three plugins currently share the course/task model, but only one of them (`mfsd-ordering`) treats it as data. The other two duplicate it as code:

| Location | What it hardcodes |
|---|---|
| `class-quest-log-engine.php` → `WEEK_BADGES` const | badge_slug → task_slug mapping, per week, for coin awarding + week-complete logic |
| `class-quest-log-renderer.php` → `WEEK_CONFIG` const | badge labels, image filenames, week titles, per week |
| `admin-page.php` → `$all_badges` array | a third copy of the same list, for the shimmer/coin-spin settings UI |

These three lists have already drifted: `admin-page.php`'s `$all_badges` is missing `badge_solution_lens` and `badge_life_wheel`, which exist in the other two. Neither `WEEK_BADGES` nor `WEEK_CONFIG` reads `wp_mfsd_task_order` at all — Quest Log has no awareness of Course Manager's task list.

Consequently:
- Adding, removing, or reordering a task in Course Manager has **no effect** on Quest Log — the badge, coins, and week-complete logic are frozen in code.
- Course Manager's Task Order tab already shows an Active/Off badge per task, but **no toggle control exists** to actually flip it — the only way to remove a task today is to delete the row outright.
- There is no single admin surface where a course's structure and its badge/coin/reward config can be managed together, despite that being the practical mental model (one task = one activity = one badge = one coin value).

## 2. Goals

1. `wp_mfsd_task_order` becomes the single source of truth for: task identity, sequencing, **and** badge/coin config.
2. Course Manager's Task Order tab becomes the one place an admin configures all of the above — the "one-stop course admin" surface.
3. Quest Log's engine and renderer read that table at runtime. All three hardcoded lists are deleted.
4. Turning a task off in Course Manager removes it from sequencing, gating, **and** the Quest Log display — without a deploy.
5. The mechanism is course-agnostic, not Foundation-Course-specific, so it carries forward into the seven-module pipeline without a repeat of this exercise.

## 3. Non-Goals

- This spec does not redesign the coin wallet, arcade economy, or animation settings (shimmer/coin-spin toggles, global anim options) — those stay in Quest Log's Settings tab as-is, just re-pointed at the dynamic badge list instead of the static one.
- This spec does not change the RAG evolution *visual* (Spark → Ember → Blaze), only how it's configured (via an `is_rag` flag rather than a hardcoded 3-item array), so it is naturally capped at however many tasks are flagged `is_rag = 1` in a course — expected to remain 3 per course (one per week) unless Mark decides otherwise later.
- Cross-course badge awarding (e.g. a Module Pipeline course reusing a Foundation Course badge slug) is out of scope; each course's tasks are assumed to own distinct badge slugs.

---

## 4. Schema Changes (`mfsd-ordering`)

### 4.1 `wp_mfsd_task_order` — new columns

| Column | Type | Default | Notes |
|---|---|---|---|
| `badge_slug` | VARCHAR(50) | NULL | If set, completing this task awards this badge. If NULL, the task has no badge (e.g. a future "Other" task type). |
| `badge_image` | VARCHAR(500) | NULL | Badge artwork URL. Uploaded via WP media library, same pattern as `mfsd_courses.image_url`. Falls back to `badge_locked.png` in the renderer if empty and unearned. |
| `coin_value` | SMALLINT UNSIGNED | 10 | Coins awarded on completion. Replaces `COIN_TASK` / `RAG_COINS` constants. |
| `is_rag` | TINYINT(1) | 0 | Flags this task's badge as a RAG evolution stage (Spark/Ember/Blaze) for the fire-path UI. At most one per week is expected but not enforced at DB level. |
| `counts_for_week_badge` | TINYINT(1) | 1 | Whether this task must be completed for the week-complete / week-achiever badges to trigger. Lets an "Other" or bonus task exist without blocking week completion. |

Migration follows the existing pattern in `mfsd-course-manager.php` (live `admin_init` check-and-`ALTER`), but since this table is *owned* by `mfsd-ordering`, the migration moves there and runs through the existing `mfsd_ordering_db_version` versioned-reinstall mechanism already in place (bump to `1.3.0`, `dbDelta` picks up new columns).

### 4.2 New table — `wp_mfsd_course_weeks`

Needed because week *titles* ("Week 2 — Interests, Barriers & Dreams into Plans") currently only exist in `WEEK_CONFIG` and have nowhere to live once that constant is deleted.

```sql
CREATE TABLE wp_mfsd_course_weeks (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    course_id   INT UNSIGNED NOT NULL,
    week        TINYINT UNSIGNED NOT NULL,
    title       VARCHAR(255) NOT NULL,
    UNIQUE KEY uq_course_week (course_id, week)
) $charset_collate;
```

Editable from Course Manager's Task Order tab (one small text input per week-header row, next to the existing "📅 Week N" divider).

### 4.3 New helper functions (`mfsd-ordering`, public API)

| Function | Purpose |
|---|---|
| `mfsd_get_course_badge_config( $course_id )` | Returns tasks for a course grouped by week, active only, each with `badge_slug`, `badge_image`, `coin_value`, `is_rag`, `counts_for_week_badge`. Replaces `WEEK_BADGES` and `WEEK_CONFIG` as the shared read path for both the engine and the renderer. |
| `mfsd_get_course_week_titles( $course_id )` | Returns `[ week_number => title ]` for a course, reading `wp_mfsd_course_weeks`, falling back to `"Week N"` if untitled. |

Centralising this in `mfsd-ordering` (rather than having Quest Log query `wp_mfsd_task_order` directly) keeps the "which plugin owns this table" boundary clean, consistent with how `mfsd_get_task_status()` already works.

---

## 5. Course Manager Changes

### 5.1 Task Order tab — new fields

The "Add Task to Course" form and the inline edit state both gain:

- **Badge slug** (text input, `sanitize_key`) — optional.
- **Badge image** (WP media library picker, same button pattern as course thumbnails) — only shown/enabled once a badge slug is set.
- **Coin value** (number input, default 10).
- **Counts toward week badge** (checkbox, default checked).
- **RAG stage** (checkbox, default unchecked) — labelled "This is the week's RAG reflection task."

Table columns gain a small 🏅 indicator when a task has a badge configured, so the sequencing table doubles as an at-a-glance badge map — this is the "one-stop" view.

### 5.2 Missing toggle — fixed

Add `wp_ajax_mfsd_cm_toggle_task` (mirrors the existing `mfsd_cm_toggle_course` handler) and wire the currently-dead Active/Off badge to a click handler, matching the course-level toggle UX already in place. This is a small, independent fix and can land ahead of the rest of this spec.

### 5.3 Week titles

Week-header divider rows (`📅 Week N`) become editable inline — clicking the header reveals a text input bound to `wp_mfsd_course_weeks`, saved via a new `mfsd_cm_save_week_title` action.

### 5.4 New AJAX endpoints

| Action | Purpose |
|---|---|
| `mfsd_cm_toggle_task` | Flip `active` on a single task row |
| `mfsd_cm_save_week_title` | Upsert `wp_mfsd_course_weeks` for a course+week |

### 5.5 Existing endpoints — extended payload

`mfsd_cm_add_task` and `mfsd_cm_update_task` gain the five new fields above (`badge_slug`, `badge_image`, `coin_value`, `is_rag`, `counts_for_week_badge`) alongside the existing ones. `mfsd_cm_get_tasks` returns them in the row payload (no query change needed — `SELECT *`).

---

## 6. Quest Log Changes

### 6.1 `class-quest-log-engine.php`

- Delete `WEEK_BADGES`, `RAG_BADGES`, `RAG_COINS`, `COIN_TASK`, `COIN_RAG_SPARK/EMBER/BLAZE` constants.
- `evaluate_all( $student_id )` takes an explicit `$course_id` (see §6.4 — settings) and calls `mfsd_get_course_badge_config( $course_id )` instead of iterating the constant.
- `evaluate_week()` counts `counts_for_week_badge = 1` tasks for the completed-count denominator, instead of `count($badges)`.
- `maybe_award_task_badge()` reads `coin_value` from the task row instead of the `RAG_COINS`/`COIN_TASK` lookup; RAG-ness comes from `is_rag` instead of matching against `RAG_BADGES[$week_num]`.
- `COIN_WEEK_COMPLETE` / `COIN_WEEK_ACHIEVER` remain as constants — these are week-milestone rewards, not per-task, and aren't part of what Mark needs to configure per-task.

### 6.2 `class-quest-log-renderer.php`

- Delete `WEEK_CONFIG` const.
- `render()` and `render_week_section()` take the array from `mfsd_get_course_badge_config( $course_id )` plus `mfsd_get_course_week_titles( $course_id )` instead of iterating the constant.
- Badge image resolution: use `badge_image` from the task row if set, else fall back to the existing `badge_locked.png` for unearned badges (current behaviour preserved for tasks not yet given custom art).
- Earned-badge display is sourced from `wp_mfsd_badges` (student's history), not gated by the task's current `active` flag in `wp_mfsd_task_order` — a badge already earned stays visible even if the task is later deactivated. Only the "available to earn" view (unearned/locked badges) should respect `active`.
- `render_rag_evolution()` builds its 3 (or N) stages from tasks flagged `is_rag = 1`, ordered by week, instead of the hardcoded `$stages` array. Fire image filenames (`fire/spark_lit.png` etc.) stay as a small positional convention since they're app chrome, not per-task content — first RAG task = spark, second = ember, third = blaze, by week order.

### 6.3 `admin-page.php`

- Delete `$all_badges` hardcoded array.
- Settings tab (shimmer config, coin-spin config) builds its per-badge rows from the same `mfsd_get_course_badge_config()` call, grouped by week title from `mfsd_get_course_week_titles()`. This is what fixes the existing drift bug (`badge_solution_lens` / `badge_life_wheel` missing from the settings UI) as a side effect.

### 6.4 New setting — which course drives this Quest Log instance

Quest Log currently has no concept of "course" — it's implicitly wired to whatever `WEEK_BADGES` said. Add a dropdown to the Settings tab:

> **Course** — `wp_dropdown_pages`-style select sourced from `mfsd_get_courses()`, stored as `mfsd_quest_course_id` option.

`evaluate_all()`, the renderer, and the admin page settings loop all read this option to know which `course_id` to pass into the new helper functions. Defaults to the Foundation Course on first upgrade (see migration, §7).

---

## 7. Migration Plan

1. **Ordering plugin**: bump `MFSD_ORDERING_VERSION` to `1.3.0`; `dbDelta` adds the five new columns to `wp_mfsd_task_order` and creates `wp_mfsd_course_weeks`.
2. **One-off data backfill script** (run once, by MTClaude, via WP-CLI or a temporary admin-only button — not a recurring migration): populate `badge_slug`, `badge_image`, `coin_value`, `is_rag`, `counts_for_week_badge` on the ~17 existing Foundation Course task rows using today's `WEEK_BADGES` / `WEEK_CONFIG` values as the source, and insert the three week titles into `wp_mfsd_course_weeks`.
3. Set `mfsd_quest_course_id` option to the Foundation Course's `course_id` as part of the same script, so Quest Log doesn't go blank on the first page load post-deploy.
4. Only after the backfill is confirmed correct (spot-check a test student's badge state pre/post) do the engine, renderer, and admin-page constant deletions go live.

This order matters: if the code switches to reading the DB before the DB has the data, every badge check fails open/closed incorrectly. Backfill first, cut over second.

---

## 8. Rollout Sequencing

Per house rules, no two Claude instances touch the same plugin — and this spec touches all three, so it should run as a single sequential MTClaude session rather than being split across Claude1/Claude2:

1. `mfsd-ordering` — schema + helper functions (foundation for everything else)
2. Data backfill script — run and verify
3. `mfsd-course-manager` — toggle fix, new form fields, week-title editing
4. `mfsd-quest-log` — engine, renderer, admin-page cutover, course-selector setting
5. Regression check: existing Foundation Course students' badge/coin state unchanged after cutover

---

## 9. Decisions (confirmed by Mark)

1. **RAG cap**: exactly one RAG task per week, always. `is_rag` remains an unenforced-at-DB-level flag (per §3), but the UI should nudge toward one-per-week (e.g. warn, not block, if a second `is_rag` task is added to the same week).
2. **Badge image fallback**: confirmed — `badge_locked.png` is the default whenever a task has no `badge_image` set, matching current behaviour.
3. **Deactivated tasks with earned badges**: confirmed — badges already earned remain visible in the student's Quest Log as a historical record even if the underlying task is later deactivated in Course Manager. No change needed to `wp_mfsd_badges` read logic; this simply means Quest Log's renderer must not filter earned-badge display by the task's current `active` state.
4. **Backfill scope**: confirmed — limited to the ~17 existing Foundation Course task rows. No other course data is in scope for the one-off script.

---

## 10. Version History

| Version | Changes |
|---|---|
| 1.1 | Open questions resolved and approved: one RAG task per week (UI warns, doesn't block, on a second); `badge_locked.png` fallback confirmed; earned badges persist as historical record regardless of task active state; backfill scoped to the 17 existing Foundation Course rows only |
| 1.0 | Initial draft — schema extension, Course Manager badge fields, Quest Log dynamic engine/renderer/admin-page, course-selector setting, migration plan |
