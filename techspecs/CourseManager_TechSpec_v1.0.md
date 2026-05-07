# MFSD Course Manager — Technical Specification v1.0

**Plugin directory:** `mfsd-course-manager/`
**Shortcode(s):** None (admin-only plugin)
**Version:** 2.1.0
**Author:** MisterT9007
**Purpose:** An admin-only WordPress plugin that provides a central configuration interface for the MFSD course structure. It allows administrators to create and manage courses, define the ordered sequence of activity tasks within each course (mapped to plugin slugs), view student progress across those tasks, and manage student enrolments. The plugin reads from and writes to the shared tables owned by the `mfsd-ordering` plugin (`wp_mfsd_courses`, `wp_mfsd_task_order`, `wp_mfsd_task_progress`, `wp_mfsd_enrolments`) but does not create those tables itself.

---

## File Structure

| File | Purpose |
|------|---------|
| `mfsd-course-manager.php` | Single bootstrap file: migration check, dependency notice, admin menu, all tab render functions, all AJAX handlers |
| `assets/admin.css` | Admin UI styles: tabs, card layout, sortable table, status badges, form helpers, inline-edit state, course thumbnail |
| `assets/admin.js` | Admin UI logic (jQuery): media library image upload, course CRUD, drag-to-reorder task list, task add/edit/delete, progress table render, enrolment CRUD |

---

## Database Schema

This plugin does not create any tables. It reads and writes the following tables which are created by the `mfsd-ordering` plugin:

### wp_mfsd_courses
| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| course_name | VARCHAR | Human-readable name (e.g. "Foundation") |
| course_slug | VARCHAR | URL-safe slug; must be unique |
| image_url | VARCHAR(500) | Optional thumbnail URL; column added by this plugin's migration if absent |
| active | TINYINT(1) | 1 = visible; 0 = hidden |

### wp_mfsd_task_order
| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| course_id | INT | FK to wp_mfsd_courses |
| week | INT | Week number (1–6) |
| task_no | INT | Task number within the week |
| sequence_order | INT | Overall position in the course; determines display and unlock order |
| task_slug | VARCHAR | Matches the plugin slug used by other MFSD plugins (e.g. `word_association`) |
| display_name | VARCHAR | Human-readable task name shown in the UI |
| active | TINYINT(1) | 1 = active; 0 = hidden |

### wp_mfsd_task_progress
| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| student_id | INT | WordPress user ID |
| task_slug | VARCHAR | Matches wp_mfsd_task_order.task_slug |
| status | ENUM | e.g. `not_started`, `in_progress`, `completed`, `available`, `locked` |
| started_date | DATETIME | When the student first started the task |
| completed_date | DATETIME | When the student completed the task |

### wp_mfsd_enrolments
| Column | Type | Notes |
|--------|------|-------|
| id | INT | Primary key |
| student_id | INT | WordPress user ID |
| course_id | INT | FK to wp_mfsd_courses |
| enrolled_date | DATETIME | Auto-set on insert |

---

## Database Migration

On every `admin_init`, the plugin checks whether the `image_url` column exists in `wp_mfsd_courses`. If absent, it adds it:
```sql
ALTER TABLE `wp_mfsd_courses` ADD COLUMN `image_url` VARCHAR(500) NULL DEFAULT NULL AFTER `course_slug`
```
This is a live migration with no activation hook — it runs automatically when the admin panel is first loaded after an upgrade.

---

## Key Flows

### 1. Course Creation
1. Admin enters a course name and slug in the Add Course form on the Courses tab.
2. JS calls `wp_ajax_mfsd_cm_add_course`.
3. Server validates name and slug, checks for slug uniqueness, inserts a new row with `active = 1`.
4. JS appends the new row to the courses table without a page reload; shows a success message for 4 seconds.
5. A course image can be added after creation via the "Add Image" button (WordPress media library picker).

### 2. Course Image Upload
1. Admin clicks "+ Add Image" or "↺ Change" on a course row.
2. JS opens the WP media library (`wp.media()`).
3. On selection, JS calls `wp_ajax_mfsd_cm_save_course_image` with the attachment URL.
4. The `image_url` column is updated; the thumbnail in the table is swapped in immediately via DOM update.
5. A "Remove" button appears. Clicking it calls the same action with an empty URL, setting `image_url = NULL`.

### 3. Task Order Management
1. Admin selects a course from the dropdown on the Task Order tab.
2. JS calls `wp_ajax_mfsd_cm_get_tasks`; server returns all tasks ordered by `sequence_order`.
3. JS renders the task table grouped by week (week-header rows are inserted between groups, not draggable).
4. Admin drags task rows using jQuery UI Sortable (handle: `⠿` icon). On drop, the row's `data-week` is updated to match the nearest week-header above it; sequence numbers are recalculated visually.
5. Admin clicks "Save Order" → JS calls `wp_ajax_mfsd_cm_save_order` with the full ordered array of `{ id, week }` objects.
6. Server recalculates `task_no` per-week group and updates `sequence_order`, `week`, and `task_no` for every row in the posted order.

### 4. Inline Task Edit
1. Admin clicks "Edit" on a task row — the row transitions to an editing state (yellow background) with inline inputs for Display Name, Week (select), and Task # (number).
2. Admin clicks "Save" → JS calls `wp_ajax_mfsd_cm_update_task`; row is updated in place with new values.
3. Admin clicks "Cancel" → row reverts to its previous display values without an AJAX call.

### 5. Student Progress View
1. Admin selects a course and/or student filter on the Progress tab, then clicks "Load Progress".
2. JS calls `wp_ajax_mfsd_cm_get_progress` with optional `course_id` and `student_id`.
3. Server performs a LEFT JOIN between `wp_mfsd_task_order` (active tasks) and `wp_mfsd_task_progress` (filtered by student if provided), returning status, started/completed dates, and student names.
4. JS renders the results as an HTML table with colour-coded status badges (Completed = green, In Progress = amber, Available = blue, Not Started / Locked = grey/red).
5. Admin can click "Reset" to delete a `wp_mfsd_task_progress` row, allowing a student to restart that task from scratch.

### 6. Enrolment Management
1. Admin selects a student and course on the Enrolments tab, clicks "Enrol Student".
2. JS calls `wp_ajax_mfsd_cm_add_enrolment`; server checks for duplicate enrolment.
3. New enrolment row prepended to the table without a page reload.
4. Existing enrolment removed by clicking "Remove" → `wp_ajax_mfsd_cm_delete_enrolment` deletes the row.

Note: Enrolment records here are for portal/progress display use. Actual access control to WordPress content is handled by ProfilePress.

---

## AJAX Endpoints

All endpoints are WordPress admin-ajax (`admin-ajax.php`). All require nonce `mfsd_cm_nonce` validated with `check_ajax_referer`. All require `manage_options` capability.

| Action | Method | Description |
|--------|--------|-------------|
| `mfsd_cm_add_course` | POST | Insert new course; validates slug uniqueness |
| `mfsd_cm_toggle_course` | POST | Toggle `active` flag on a course |
| `mfsd_cm_delete_course` | POST | Delete course + its task_order rows + its enrolment rows (task progress rows are retained) |
| `mfsd_cm_save_course_image` | POST | Update or clear `image_url` on a course |
| `mfsd_cm_get_tasks` | POST | Return all tasks for a course ordered by `sequence_order` |
| `mfsd_cm_add_task` | POST | Insert a task at the end of a course (max existing sequence_order + 1) |
| `mfsd_cm_save_order` | POST | Reorder tasks; supports new format (`rows[N][id]` + `rows[N][week]`, auto-recalculates `task_no`) and legacy format (flat ID array) |
| `mfsd_cm_update_task` | POST | Update `display_name`, `week`, `task_no` for a single task |
| `mfsd_cm_delete_task` | POST | Delete a task from the ordering table |
| `mfsd_cm_get_progress` | POST | Return task progress with optional course/student filters; LEFT JOINs task_order + task_progress + users |
| `mfsd_cm_reset_task` | POST | Delete a `wp_mfsd_task_progress` row by progress ID |
| `mfsd_cm_add_enrolment` | POST | Create a student-course enrolment; checks for duplicates |
| `mfsd_cm_delete_enrolment` | POST | Remove a student-course enrolment by ID |

---

## Admin Panel

Accessed via **WP Admin > MFSD Courses** (dashicon: welcome-learn-more, menu position 56). Requires `manage_options` capability.

The page renders as a four-tab interface using URL-based tab routing (`?tab=`). The active tab is a GET parameter; tabs are standard `<a>` links, not JavaScript toggles. Each tab is a white card with a 2px bottom border tab strip.

**Courses tab** (`?tab=courses`)
- Table listing all courses (all statuses) with ID, thumbnail, name, slug, active badge, and Activate/Deactivate + Delete actions.
- Inline image upload per row (WP media library), with "Add Image"/"Change"/"Remove" buttons.
- "Add New Course" form below the table (name + slug + button).

**Task Order tab** (`?tab=task-order`)
- Course dropdown; selecting a course loads its tasks via AJAX.
- Sortable table (jQuery UI Sortable, y-axis, handle on `⠿` icon): columns for drag handle, sequence number, week, task #, display name, plugin slug, active badge, edit/delete buttons.
- Week-header rows (styled blue, not draggable) are auto-inserted between groups and refreshed after each drag or edit.
- Inline edit for display name, week, and task number.
- "Add Task to Course" form below: display name, plugin slug, week (1–6), task number.

**Student Progress tab** (`?tab=progress`)
- Course and student dropdowns (independent filters, both optional), "Load Progress" button.
- Results table rendered dynamically: student, task name, week, sequence, status badge, started date, completed date, reset button.

**Enrolments tab** (`?tab=enrolments`)
- Table of all current enrolments with student name, course name, enrolled date, remove button.
- "Add Enrolment" form: student dropdown (all `student` role users), course dropdown (active courses only).

---

## SteveGPT Integration

None. This plugin does not call SteveGPT or the Anthropic API.

---

## Assets

**admin.css** — Admin-only stylesheet (loaded only on the `toplevel_page_mfsd-course-manager` hook). Styles: tab strip with active underline, card container, data tables (`mfsd-table`), drag handle cursor, jQuery UI sortable helper (yellow background on drag, blue placeholder). Status badges (`.badge-active`, `.badge-inactive`, `.badge-completed`, `.badge-inprogress`, `.badge-available`, `.badge-notstarted`, `.badge-locked`) use colour-coded pill shapes. Form helpers: flex row and CSS grid for the add-task form fields. Inline-edit row state (`.mfsd-editing`, yellow background, drag handle dimmed). Course thumbnail cell (80×50px with object-fit cover). Success/error message inline blocks.

**admin.js** — jQuery-based admin UI (version 6 syntax with `const`/`let`/template literals). Loaded only on the plugin's admin page. Dependencies: `jquery`, `jquery-ui-sortable` (for drag reorder), `wp.media` (for image picker). Uses a shared `ajax(action, data, done, fail)` helper that wraps `$.post` and handles the WP `{ success, data }` response shape. Key sections: media frame management (singleton frame to prevent duplicate instances), course add/toggle/delete, task loading/rendering with week-header injection and sortable init, drag-stop handler that re-derives week from preceding header row, save-order serialiser, inline-edit state machine (view mode → editing mode → view mode), progress table renderer, enrolment add/remove.

---

## Security

**Capability check:** Every AJAX handler starts with `current_user_can('manage_options')` after the nonce check. No student or subscriber can access any action.

**Nonce:** All AJAX requests include a nonce created with `wp_create_nonce('mfsd_cm_nonce')` and verified with `check_ajax_referer('mfsd_cm_nonce', 'nonce')`. The nonce is injected via `wp_localize_script` as `mfsdCM.nonce`.

**Input sanitisation:**
- Course name → `sanitize_text_field`
- Course slug → `sanitize_title`
- Task display name → `sanitize_text_field`
- Task slug → `sanitize_key`
- Image URL → `esc_url_raw`
- All IDs → `(int)` cast
- Week / task_no / sequence numbers → `(int)` cast

**SQL:** All parameterised queries use `$wpdb->prepare()`. The progress query constructs a dynamic WHERE clause from pre-validated integer IDs only.

**Client-side sanitisation:** The JS `escHtml()` helper escapes `&`, `<`, `>`, `"` before inserting user-supplied data into DOM HTML via template literals.

**Dependency guard:** The page render function returns immediately if `mfsd_get_task_status` is not defined (i.e. the `mfsd-ordering` plugin is not active), preventing errors from missing tables.

---

## Inter-Plugin Dependencies

| Plugin | Relationship |
|--------|-------------|
| `mfsd-ordering` | Hard dependency. This plugin creates `wp_mfsd_courses`, `wp_mfsd_task_order`, `wp_mfsd_task_progress`, and `wp_mfsd_enrolments` tables, and exposes `mfsd_get_task_status()`. Course Manager reads and writes all four tables but creates none of them. An admin notice is shown if the ordering plugin is not active. |
| ProfilePress | Soft dependency (mentioned in UI). Actual student access control to WordPress content is handled by ProfilePress; enrolment records in this plugin are for portal/progress display purposes only. |

---

## Version History

| Version | Changes |
|---------|---------|
| 2.1.0 | Current version. Added course image upload (WP media library), `image_url` column migration, image remove action |
| 2.0.x | Enrolments tab; inline task editing; progress reset action |
| 1.x | Initial release: courses, task ordering, progress view |
