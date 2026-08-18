<?php
/**
 * Plugin Name: MFSD Course Manager
 * Description: Admin interface for configuring MFSD courses, task ordering and viewing student progress.
 * Version:     3.2.0
 * Author:      MisterT9007
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'MFSD_CM_VERSION', '3.2.0' );

// ─────────────────────────────────────────────
// DB MIGRATION — add image_url column if absent
// ─────────────────────────────────────────────

add_action( 'admin_init', function () {
    global $wpdb;
    $table = $wpdb->prefix . 'mfsd_courses';
    $col   = $wpdb->get_results( "SHOW COLUMNS FROM `{$table}` LIKE 'image_url'" );
    if ( empty( $col ) ) {
        $wpdb->query( "ALTER TABLE `{$table}` ADD COLUMN `image_url` VARCHAR(500) NULL DEFAULT NULL AFTER `course_slug`" );
    }
} );

// ─────────────────────────────────────────────
// DEPENDENCY CHECK
// ─────────────────────────────────────────────

add_action( 'admin_notices', function () {
    if ( ! function_exists( 'mfsd_get_task_status' ) ) {
        echo '<div class="notice notice-error"><p><strong>MFSD Course Manager</strong> requires the <em>MFSD Ordering Utility</em> plugin to be active.</p></div>';
    }
} );

// ─────────────────────────────────────────────
// ADMIN MENU
// ─────────────────────────────────────────────

add_action( 'admin_menu', function () {
    add_menu_page(
        'MFSD Course Manager',
        'MFSD Courses',
        'manage_options',
        'mfsd-course-manager',
        'mfsd_cm_render_page',
        'dashicons-welcome-learn-more',
        56
    );
} );

// ─────────────────────────────────────────────
// ASSETS
// ─────────────────────────────────────────────

add_action( 'admin_enqueue_scripts', function ( $hook ) {
    if ( $hook !== 'toplevel_page_mfsd-course-manager' ) return;

    wp_enqueue_media(); // WordPress media library
    wp_enqueue_script( 'jquery-ui-sortable' );

    wp_enqueue_style(
        'mfsd-cm-style',
        plugin_dir_url( __FILE__ ) . 'assets/admin.css',
        [],
        MFSD_CM_VERSION
    );

    wp_enqueue_script(
        'mfsd-cm-script',
        plugin_dir_url( __FILE__ ) . 'assets/admin.js',
        [ 'jquery', 'jquery-ui-sortable' ],
        MFSD_CM_VERSION,
        true
    );

    wp_localize_script( 'mfsd-cm-script', 'mfsdCM', [
        'ajaxUrl' => admin_url( 'admin-ajax.php' ),
        'nonce'   => wp_create_nonce( 'mfsd_cm_nonce' ),
    ] );
} );

// ─────────────────────────────────────────────
// PAGE RENDER — TAB ROUTER
// ─────────────────────────────────────────────

function mfsd_cm_render_page() {
    if ( ! function_exists( 'mfsd_get_task_status' ) ) return;

    $tab  = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'courses';
    $tabs = [
        'courses'    => 'Courses',
        'task-order' => 'Task Order',
        'progress'   => 'Student Progress',
        'enrolments' => 'Enrolments',
    ];
    ?>
    <div class="wrap mfsd-cm-wrap">
        <h1>🎓 MFSD Course Manager</h1>

        <nav class="mfsd-tabs">
            <?php foreach ( $tabs as $key => $label ) :
                $active = $tab === $key ? ' mfsd-tab-active' : '';
                $url    = admin_url( 'admin.php?page=mfsd-course-manager&tab=' . $key );
            ?>
                <a href="<?php echo esc_url( $url ); ?>" class="mfsd-tab<?php echo $active; ?>">
                    <?php echo esc_html( $label ); ?>
                </a>
            <?php endforeach; ?>
        </nav>

        <div class="mfsd-tab-content">
            <?php
            switch ( $tab ) {
                case 'courses':    mfsd_cm_tab_courses();    break;
                case 'task-order': mfsd_cm_tab_task_order(); break;
                case 'progress':   mfsd_cm_tab_progress();   break;
                case 'enrolments': mfsd_cm_tab_enrolments(); break;
            }
            ?>
        </div>
    </div>
    <?php
}

// ─────────────────────────────────────────────
// TAB: COURSES
// ─────────────────────────────────────────────

function mfsd_cm_tab_courses() {
    global $wpdb;
    $courses = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}mfsd_courses ORDER BY id ASC" );
    ?>
    <div class="mfsd-card">
        <h2>Courses</h2>

        <table class="mfsd-table" id="mfsd-courses-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>Image</th>
                    <th>Course Name</th>
                    <th>Slug</th>
                    <th>Active</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if ( $courses ) : foreach ( $courses as $c ) : ?>
                <tr data-id="<?php echo esc_attr( $c->id ); ?>">
                    <td><?php echo esc_html( $c->id ); ?></td>
                    <td class="mfsd-course-thumb-cell">
                        <?php if ( ! empty( $c->image_url ) ) : ?>
                            <img src="<?php echo esc_url( $c->image_url ); ?>"
                                 class="mfsd-course-thumb" alt="">
                        <?php else : ?>
                            <div class="mfsd-course-thumb-placeholder">No image</div>
                        <?php endif; ?>
                        <button class="button button-small mfsd-upload-image"
                                data-id="<?php echo esc_attr( $c->id ); ?>"
                                style="margin-top:6px;display:block;">
                            <?php echo empty( $c->image_url ) ? '+ Add Image' : '↺ Change'; ?>
                        </button>
                        <?php if ( ! empty( $c->image_url ) ) : ?>
                            <button class="button button-small button-link-delete mfsd-remove-image"
                                    data-id="<?php echo esc_attr( $c->id ); ?>"
                                    style="margin-top:4px;display:block;">
                                Remove
                            </button>
                        <?php endif; ?>
                    </td>
                    <td class="editable-name"><?php echo esc_html( $c->course_name ); ?></td>
                    <td><code><?php echo esc_html( $c->course_slug ); ?></code></td>
                    <td>
                        <span class="mfsd-status-badge <?php echo $c->active ? 'badge-active' : 'badge-inactive'; ?>">
                            <?php echo $c->active ? 'Active' : 'Inactive'; ?>
                        </span>
                    </td>
                    <td>
                        <button class="button button-small mfsd-toggle-course"
                                data-id="<?php echo esc_attr( $c->id ); ?>"
                                data-active="<?php echo esc_attr( $c->active ); ?>">
                            <?php echo $c->active ? 'Deactivate' : 'Activate'; ?>
                        </button>
                        <button class="button button-small button-link-delete mfsd-delete-course"
                                data-id="<?php echo esc_attr( $c->id ); ?>">
                            Delete
                        </button>
                    </td>
                </tr>
                <?php endforeach; else : ?>
                <tr><td colspan="6" style="text-align:center;color:#999;">No courses yet.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>

        <hr>
        <h3>Add New Course</h3>
        <div class="mfsd-form-row">
            <input type="text" id="new-course-name" placeholder="Course name (e.g. Foundation)" class="regular-text">
            <input type="text" id="new-course-slug" placeholder="course-slug (e.g. foundation)" class="regular-text">
            <button class="button button-primary" id="mfsd-add-course">Add Course</button>
        </div>
        <p class="description" style="margin-top:6px;">You can add a course image after the course has been created.</p>
        <p id="mfsd-course-message" class="mfsd-message" style="display:none;"></p>
    </div>
    <?php
}

// ─────────────────────────────────────────────
// TAB: TASK ORDER
// ─────────────────────────────────────────────

function mfsd_cm_tab_task_order() {
    global $wpdb;
    $courses = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}mfsd_courses WHERE active = 1 ORDER BY id ASC" );
    ?>
    <div class="mfsd-card">
        <h2>Task Order</h2>

        <?php if ( ! $courses ) : ?>
            <p>No active courses found. <a href="<?php echo admin_url('admin.php?page=mfsd-course-manager&tab=courses'); ?>">Add a course first.</a></p>
        <?php else : ?>

        <div class="mfsd-form-row">
            <label for="mfsd-course-select"><strong>Select Course:</strong></label>
            <select id="mfsd-course-select">
                <option value="">— choose a course —</option>
                <?php foreach ( $courses as $c ) : ?>
                    <option value="<?php echo esc_attr( $c->id ); ?>"><?php echo esc_html( $c->course_name ); ?></option>
                <?php endforeach; ?>
            </select>
        </div>

        <div id="mfsd-task-order-container" style="display:none;">
            <div id="mfsd-task-list-wrapper">
                <p class="description">Drag rows to reorder. Click a week header to rename it. Click <strong>Save Order</strong> after reordering.</p>
                <table class="mfsd-table">
                    <thead>
                        <tr>
                            <th style="width:30px;"></th>
                            <th style="width:40px;">Seq</th>
                            <th style="width:60px;">Week</th>
                            <th style="width:60px;">Task #</th>
                            <th>Display Name</th>
                            <th>Plugin Slug</th>
                            <th style="width:150px;">Badge</th>
                            <th style="width:60px;">Coins</th>
                            <th style="width:110px;">Shimmer</th>
                            <th style="width:70px;">Active</th>
                            <th style="width:160px;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="mfsd-sortable-tasks">
                        <!-- populated via AJAX -->
                    </tbody>
                </table>
                <div class="mfsd-form-row" style="margin-top:12px;">
                    <button class="button button-primary" id="mfsd-save-order">💾 Save Order</button>
                    <span id="mfsd-order-message" class="mfsd-message" style="display:none;"></span>
                </div>
            </div>

            <hr>
            <h3>Add Task to Course</h3>
            <div class="mfsd-form-grid">
                <div>
                    <label>Display Name</label>
                    <input type="text" id="new-task-name" placeholder="e.g. Word Association" class="regular-text">
                </div>
                <div>
                    <label>Plugin Slug</label>
                    <input type="text" id="new-task-slug" placeholder="e.g. word_association" class="regular-text">
                </div>
                <div>
                    <label>Week</label>
                    <select id="new-task-week">
                        <option value="1">Week 1</option>
                        <option value="2">Week 2</option>
                        <option value="3">Week 3</option>
                        <option value="4">Week 4</option>
                        <option value="5">Week 5</option>
                        <option value="6">Week 6</option>
                    </select>
                </div>
                <div>
                    <label>Task # (within week)</label>
                    <input type="number" id="new-task-no" value="1" min="1" max="99" style="width:70px;">
                </div>
                <div>
                    <label>Badge Slug <span class="description">(optional)</span></label>
                    <input type="text" id="new-task-badge-slug" placeholder="e.g. badge_word_assoc" class="regular-text">
                </div>
                <div>
                    <label>Badge Image</label>
                    <div id="new-task-badge-image-wrap">
                        <input type="hidden" id="new-task-badge-image">
                        <div id="new-task-badge-image-preview" class="mfsd-badge-image-preview"></div>
                        <button type="button" class="button button-small mfsd-upload-badge-image" id="new-task-upload-badge-image" disabled>+ Add Image</button>
                    </div>
                    <p class="description">Enter a badge slug first to enable this.</p>
                </div>
                <div>
                    <label>Coin Value</label>
                    <input type="number" id="new-task-coin-value" value="10" min="0" max="999" style="width:70px;">
                </div>
                <div>
                    <label>
                        <input type="checkbox" id="new-task-counts" checked>
                        Counts toward week badge
                    </label>
                </div>
                <div>
                    <label>
                        <input type="checkbox" id="new-task-is-rag">
                        This is the week's RAG reflection task
                    </label>
                </div>
                <div>
                    <label>
                        <input type="checkbox" id="new-task-shimmer-enabled">
                        Shimmer Sweep enabled
                    </label>
                </div>
                <div>
                    <label>Shimmer Interval (seconds)</label>
                    <input type="number" id="new-task-shimmer-interval" value="5" min="2" max="30" style="width:70px;">
                </div>
            </div>
            <div class="mfsd-form-row" style="margin-top:10px;">
                <button class="button button-primary" id="mfsd-add-task">Add Task</button>
                <span id="mfsd-task-message" class="mfsd-message" style="display:none;"></span>
            </div>
        </div>

        <?php endif; ?>
    </div>
    <?php
}

// ─────────────────────────────────────────────
// TAB: STUDENT PROGRESS
// ─────────────────────────────────────────────

function mfsd_cm_tab_progress() {
    global $wpdb;
    $courses  = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}mfsd_courses WHERE active = 1 ORDER BY id ASC" );
    $students = get_users( [ 'role' => 'student', 'orderby' => 'display_name' ] );
    ?>
    <div class="mfsd-card">
        <h2>Student Progress</h2>

        <div class="mfsd-form-row">
            <label><strong>Course:</strong></label>
            <select id="progress-course-select">
                <option value="">— all courses —</option>
                <?php foreach ( $courses as $c ) : ?>
                    <option value="<?php echo esc_attr( $c->id ); ?>"><?php echo esc_html( $c->course_name ); ?></option>
                <?php endforeach; ?>
            </select>

            <label style="margin-left:16px;"><strong>Student:</strong></label>
            <select id="progress-student-select">
                <option value="">— all students —</option>
                <?php foreach ( $students as $s ) : ?>
                    <option value="<?php echo esc_attr( $s->ID ); ?>"><?php echo esc_html( $s->display_name ); ?></option>
                <?php endforeach; ?>
            </select>

            <button class="button" id="mfsd-load-progress" style="margin-left:12px;">Load Progress</button>
        </div>

        <div id="mfsd-progress-container" style="margin-top:20px;">
            <p style="color:#999;">Select filters and click Load Progress.</p>
        </div>
    </div>
    <?php
}

// ─────────────────────────────────────────────
// TAB: ENROLMENTS
// ─────────────────────────────────────────────

function mfsd_cm_tab_enrolments() {
    global $wpdb;
    $courses  = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}mfsd_courses WHERE active = 1 ORDER BY id ASC" );
    $students = get_users( [ 'role' => 'student', 'orderby' => 'display_name' ] );

    $enrolments = $wpdb->get_results(
        "SELECT e.*, u.display_name, c.course_name
         FROM {$wpdb->prefix}mfsd_enrolments e
         JOIN {$wpdb->users} u ON u.ID = e.student_id
         JOIN {$wpdb->prefix}mfsd_courses c ON c.id = e.course_id
         ORDER BY e.enrolled_date DESC"
    );
    ?>
    <div class="mfsd-card">
        <h2>Enrolments</h2>
        <p class="description">Managed here for portal use. Access control is handled by ProfilePress.</p>

        <table class="mfsd-table">
            <thead>
                <tr>
                    <th>Student</th>
                    <th>Course</th>
                    <th>Enrolled</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="mfsd-enrolments-body">
                <?php if ( $enrolments ) : foreach ( $enrolments as $e ) : ?>
                <tr data-id="<?php echo esc_attr( $e->id ); ?>">
                    <td><?php echo esc_html( $e->display_name ); ?></td>
                    <td><?php echo esc_html( $e->course_name ); ?></td>
                    <td><?php echo esc_html( date( 'd M Y', strtotime( $e->enrolled_date ) ) ); ?></td>
                    <td>
                        <button class="button button-small button-link-delete mfsd-delete-enrolment"
                                data-id="<?php echo esc_attr( $e->id ); ?>">Remove</button>
                    </td>
                </tr>
                <?php endforeach; else : ?>
                <tr><td colspan="4" style="text-align:center;color:#999;">No enrolments recorded.</td></tr>
                <?php endif; ?>
            </tbody>
        </table>

        <hr>
        <h3>Add Enrolment</h3>
        <div class="mfsd-form-row">
            <select id="enrol-student-select">
                <option value="">— select student —</option>
                <?php foreach ( $students as $s ) : ?>
                    <option value="<?php echo esc_attr( $s->ID ); ?>"><?php echo esc_html( $s->display_name ); ?></option>
                <?php endforeach; ?>
            </select>
            <select id="enrol-course-select">
                <option value="">— select course —</option>
                <?php foreach ( $courses as $c ) : ?>
                    <option value="<?php echo esc_attr( $c->id ); ?>"><?php echo esc_html( $c->course_name ); ?></option>
                <?php endforeach; ?>
            </select>
            <button class="button button-primary" id="mfsd-add-enrolment">Enrol Student</button>
        </div>
        <p id="mfsd-enrolment-message" class="mfsd-message" style="display:none;"></p>
    </div>
    <?php
}

// ─────────────────────────────────────────────
// AJAX: COURSES
// ─────────────────────────────────────────────

add_action( 'wp_ajax_mfsd_cm_add_course', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $name = sanitize_text_field( $_POST['course_name'] ?? '' );
    $slug = sanitize_title( $_POST['course_slug'] ?? $name );

    if ( ! $name || ! $slug ) wp_send_json_error( 'Name and slug are required.' );

    $exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}mfsd_courses WHERE course_slug = %s", $slug
    ) );
    if ( $exists ) wp_send_json_error( 'A course with that slug already exists.' );

    $wpdb->insert( "{$wpdb->prefix}mfsd_courses", [
        'course_name' => $name,
        'course_slug' => $slug,
        'active'      => 1,
    ] );

    wp_send_json_success( [
        'id'          => $wpdb->insert_id,
        'course_name' => $name,
        'course_slug' => $slug,
        'active'      => 1,
    ] );
} );

add_action( 'wp_ajax_mfsd_cm_toggle_course', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id     = (int) ( $_POST['id'] ?? 0 );
    $active = (int) ( $_POST['active'] ?? 0 );
    $new    = $active ? 0 : 1;

    $wpdb->update( "{$wpdb->prefix}mfsd_courses", [ 'active' => $new ], [ 'id' => $id ] );
    wp_send_json_success( [ 'new_active' => $new ] );
} );

add_action( 'wp_ajax_mfsd_cm_delete_course', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id = (int) ( $_POST['id'] ?? 0 );
    $wpdb->delete( "{$wpdb->prefix}mfsd_courses",    [ 'id'        => $id ] );
    $wpdb->delete( "{$wpdb->prefix}mfsd_task_order", [ 'course_id' => $id ] );
    $wpdb->delete( "{$wpdb->prefix}mfsd_enrolments", [ 'course_id' => $id ] );
    wp_send_json_success();
} );

// ── Save course image URL ─────────────────────
add_action( 'wp_ajax_mfsd_cm_save_course_image', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id  = (int) ( $_POST['id'] ?? 0 );
    $url = esc_url_raw( $_POST['image_url'] ?? '' );

    if ( ! $id ) wp_send_json_error( 'Invalid course ID.' );

    $wpdb->update(
        "{$wpdb->prefix}mfsd_courses",
        [ 'image_url' => $url ?: null ],
        [ 'id' => $id ]
    );

    wp_send_json_success( [ 'image_url' => $url ] );
} );

// ─────────────────────────────────────────────
// AJAX: TASKS
// ─────────────────────────────────────────────

/**
 * Confirmed by Mark: exactly one RAG task per week, always — but it's a
 * non-blocking warning, not an enforced constraint (MYF-331 spec §9.1).
 * Shared by both the add and update handlers.
 *
 * @return string|null  Warning message, or null if no conflict.
 */
function mfsd_cm_check_rag_duplicate( $course_id, $week, $is_rag, $exclude_task_id = 0 ) {
    if ( ! $is_rag ) return null;

    global $wpdb;
    $other = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}mfsd_task_order
         WHERE course_id = %d AND week = %d AND is_rag = 1 AND active = 1 AND id != %d
         LIMIT 1",
        $course_id, $week, $exclude_task_id
    ) );

    if ( $other ) {
        return "Another active RAG task already exists for Week {$week} in this course. Exactly one is expected — you may want to un-flag the other one.";
    }
    return null;
}

add_action( 'wp_ajax_mfsd_cm_get_tasks', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $course_id = (int) ( $_POST['course_id'] ?? 0 );

    $tasks = $wpdb->get_results( $wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}mfsd_task_order
         WHERE course_id = %d ORDER BY sequence_order ASC",
        $course_id
    ) );

    $week_titles = function_exists( 'mfsd_get_course_week_titles' )
        ? mfsd_get_course_week_titles( $course_id )
        : [];

    wp_send_json_success( [ 'tasks' => $tasks, 'week_titles' => $week_titles ] );
} );

add_action( 'wp_ajax_mfsd_cm_add_task', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $course_id    = (int) ( $_POST['course_id']    ?? 0 );
    $week         = (int) ( $_POST['week']         ?? 1 );
    $task_no      = (int) ( $_POST['task_no']      ?? 1 );
    $task_slug    = sanitize_key( $_POST['task_slug']    ?? '' );
    $display_name = sanitize_text_field( $_POST['display_name'] ?? '' );

    $badge_slug   = sanitize_key( $_POST['badge_slug'] ?? '' );
    $badge_image  = esc_url_raw( $_POST['badge_image'] ?? '' );
    $coin_value   = (int) ( $_POST['coin_value'] ?? 10 );
    $is_rag       = ! empty( $_POST['is_rag'] ) ? 1 : 0;
    $counts       = isset( $_POST['counts_for_week_badge'] ) ? ( $_POST['counts_for_week_badge'] ? 1 : 0 ) : 1;
    $shimmer_on   = ! empty( $_POST['shimmer_enabled'] ) ? 1 : 0;
    $shimmer_int  = max( 2, min( 30, (int) ( $_POST['shimmer_interval'] ?? 5 ) ) );

    if ( ! $course_id || ! $task_slug || ! $display_name ) {
        wp_send_json_error( 'All fields are required.' );
    }

    $max_seq = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT MAX(sequence_order) FROM {$wpdb->prefix}mfsd_task_order WHERE course_id = %d",
        $course_id
    ) );

    $wpdb->insert( "{$wpdb->prefix}mfsd_task_order", [
        'course_id'             => $course_id,
        'week'                  => $week,
        'task_no'               => $task_no,
        'sequence_order'        => $max_seq + 1,
        'task_slug'             => $task_slug,
        'display_name'          => $display_name,
        'active'                => 1,
        'badge_slug'            => $badge_slug ?: null,
        'badge_image'           => $badge_image ?: null,
        'coin_value'            => $coin_value,
        'is_rag'                => $is_rag,
        'counts_for_week_badge' => $counts,
        'shimmer_enabled'       => $shimmer_on,
        'shimmer_interval'      => $shimmer_int,
    ] );

    $warning = mfsd_cm_check_rag_duplicate( $course_id, $week, $is_rag, $wpdb->insert_id );

    wp_send_json_success( [ 'id' => $wpdb->insert_id, 'warning' => $warning ] );
} );

add_action( 'wp_ajax_mfsd_cm_save_order', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $rows  = $_POST['rows']  ?? null;
    $order = $_POST['order'] ?? null;

    if ( $rows ) {
        // New format: rows[N][id] + rows[N][week] — auto-calculates task_no per week group
        $week_counters = [];
        foreach ( $rows as $seq => $row ) {
            $task_id = (int) ( $row['id']   ?? 0 );
            $week    = (int) ( $row['week'] ?? 1 );
            if ( ! $task_id ) continue;
            $week_counters[ $week ] = ( $week_counters[ $week ] ?? 0 ) + 1;
            $wpdb->update(
                "{$wpdb->prefix}mfsd_task_order",
                [ 'sequence_order' => (int) $seq + 1, 'week' => $week, 'task_no' => $week_counters[ $week ] ],
                [ 'id' => $task_id ]
            );
        }
    } elseif ( $order ) {
        // Legacy format: flat array of IDs
        foreach ( array_map( 'intval', $order ) as $seq => $task_id ) {
            $wpdb->update(
                "{$wpdb->prefix}mfsd_task_order",
                [ 'sequence_order' => $seq + 1 ],
                [ 'id' => $task_id ]
            );
        }
    }

    wp_send_json_success();
} );

add_action( 'wp_ajax_mfsd_cm_update_task', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id           = (int) ( $_POST['id']           ?? 0 );
    $week         = (int) ( $_POST['week']         ?? 1 );
    $task_no      = (int) ( $_POST['task_no']      ?? 1 );
    $display_name = sanitize_text_field( $_POST['display_name'] ?? '' );

    $badge_slug   = sanitize_key( $_POST['badge_slug'] ?? '' );
    $badge_image  = esc_url_raw( $_POST['badge_image'] ?? '' );
    $coin_value   = (int) ( $_POST['coin_value'] ?? 10 );
    $is_rag       = ! empty( $_POST['is_rag'] ) ? 1 : 0;
    $counts       = isset( $_POST['counts_for_week_badge'] ) ? ( $_POST['counts_for_week_badge'] ? 1 : 0 ) : 1;
    $shimmer_on   = ! empty( $_POST['shimmer_enabled'] ) ? 1 : 0;
    $shimmer_int  = max( 2, min( 30, (int) ( $_POST['shimmer_interval'] ?? 5 ) ) );

    if ( ! $id || ! $display_name ) wp_send_json_error( 'Invalid data.' );

    $course_id = (int) $wpdb->get_var( $wpdb->prepare(
        "SELECT course_id FROM {$wpdb->prefix}mfsd_task_order WHERE id = %d", $id
    ) );

    $wpdb->update(
        "{$wpdb->prefix}mfsd_task_order",
        [
            'week'                  => $week,
            'task_no'               => $task_no,
            'display_name'          => $display_name,
            'badge_slug'            => $badge_slug ?: null,
            'badge_image'           => $badge_image ?: null,
            'coin_value'            => $coin_value,
            'is_rag'                => $is_rag,
            'counts_for_week_badge' => $counts,
            'shimmer_enabled'       => $shimmer_on,
            'shimmer_interval'      => $shimmer_int,
        ],
        [ 'id' => $id ]
    );

    $warning = mfsd_cm_check_rag_duplicate( $course_id, $week, $is_rag, $id );

    wp_send_json_success( [ 'warning' => $warning ] );
} );

add_action( 'wp_ajax_mfsd_cm_toggle_task', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id     = (int) ( $_POST['id'] ?? 0 );
    $active = (int) ( $_POST['active'] ?? 0 );
    $new    = $active ? 0 : 1;

    $wpdb->update( "{$wpdb->prefix}mfsd_task_order", [ 'active' => $new ], [ 'id' => $id ] );
    wp_send_json_success( [ 'new_active' => $new ] );
} );

// MYF-340 — lightweight save for the inline Shimmer column on the Task Order
// table, so it's editable without opening the full Edit form (per ticket).
add_action( 'wp_ajax_mfsd_cm_save_task_shimmer', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id      = (int) ( $_POST['id'] ?? 0 );
    $enabled = ! empty( $_POST['shimmer_enabled'] ) ? 1 : 0;
    $interval = max( 2, min( 30, (int) ( $_POST['shimmer_interval'] ?? 5 ) ) );

    if ( ! $id ) wp_send_json_error( 'Invalid task ID.' );

    $wpdb->update(
        "{$wpdb->prefix}mfsd_task_order",
        [ 'shimmer_enabled' => $enabled, 'shimmer_interval' => $interval ],
        [ 'id' => $id ],
        [ '%d', '%d' ],
        [ '%d' ]
    );

    wp_send_json_success( [ 'shimmer_enabled' => $enabled, 'shimmer_interval' => $interval ] );
} );

add_action( 'wp_ajax_mfsd_cm_delete_task', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id = (int) ( $_POST['id'] ?? 0 );
    $wpdb->delete( "{$wpdb->prefix}mfsd_task_order", [ 'id' => $id ] );
    wp_send_json_success();
} );

// ── Week titles ────────────────────────────────
add_action( 'wp_ajax_mfsd_cm_save_week_title', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $course_id = (int) ( $_POST['course_id'] ?? 0 );
    $week      = (int) ( $_POST['week']      ?? 0 );
    $title     = sanitize_text_field( $_POST['title'] ?? '' );

    if ( ! $course_id || ! $week || ! $title ) wp_send_json_error( 'Course, week and title are all required.' );

    $wpdb->query( $wpdb->prepare(
        "INSERT INTO {$wpdb->prefix}mfsd_course_weeks (course_id, week, title) VALUES (%d, %d, %s)
         ON DUPLICATE KEY UPDATE title = VALUES(title)",
        $course_id, $week, $title
    ) );

    wp_send_json_success( [ 'title' => $title ] );
} );

// ─────────────────────────────────────────────
// AJAX: PROGRESS
// ─────────────────────────────────────────────

add_action( 'wp_ajax_mfsd_cm_get_progress', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $course_id  = (int) ( $_POST['course_id']  ?? 0 );
    $student_id = (int) ( $_POST['student_id'] ?? 0 );

    $where  = [ '1=1' ];
    $params = [];

    if ( $course_id ) {
        $where[]  = 't.course_id = %d';
        $params[] = $course_id;
    }
    if ( $student_id ) {
        $where[]  = 'p.student_id = %d';
        $params[] = $student_id;
    }

    $where_sql = implode( ' AND ', $where );

    $sql = "SELECT t.display_name, t.week, t.task_no, t.task_slug, t.sequence_order,
                   u.display_name AS student_name,
                   COALESCE(p.status, 'not_started') AS status,
                   p.started_date, p.completed_date, p.id AS progress_id, p.student_id
            FROM {$wpdb->prefix}mfsd_task_order t
            LEFT JOIN {$wpdb->prefix}mfsd_task_progress p ON p.task_slug = t.task_slug";

    if ( $student_id ) {
        $sql .= " AND p.student_id = %d";
        array_unshift( $params, $student_id );
    }

    $sql .= " LEFT JOIN {$wpdb->users} u ON u.ID = p.student_id
              WHERE t.active = 1 AND $where_sql
              ORDER BY p.student_id, t.sequence_order";

    $results = $params
        ? $wpdb->get_results( $wpdb->prepare( $sql, ...$params ) )
        : $wpdb->get_results( $sql );

    wp_send_json_success( $results );
} );

add_action( 'wp_ajax_mfsd_cm_reset_task', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $progress_id = (int) ( $_POST['progress_id'] ?? 0 );
    $wpdb->delete( "{$wpdb->prefix}mfsd_task_progress", [ 'id' => $progress_id ] );
    wp_send_json_success();
} );

// ─────────────────────────────────────────────
// AJAX: ENROLMENTS
// ─────────────────────────────────────────────

add_action( 'wp_ajax_mfsd_cm_add_enrolment', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $student_id = (int) ( $_POST['student_id'] ?? 0 );
    $course_id  = (int) ( $_POST['course_id']  ?? 0 );

    if ( ! $student_id || ! $course_id ) wp_send_json_error( 'Student and course are required.' );

    $exists = $wpdb->get_var( $wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}mfsd_enrolments WHERE student_id = %d AND course_id = %d",
        $student_id, $course_id
    ) );
    if ( $exists ) wp_send_json_error( 'Student is already enrolled on this course.' );

    $wpdb->insert( "{$wpdb->prefix}mfsd_enrolments", [
        'student_id' => $student_id,
        'course_id'  => $course_id,
    ] );

    $student = get_user_by( 'id', $student_id );
    $course  = $wpdb->get_row( $wpdb->prepare(
        "SELECT course_name FROM {$wpdb->prefix}mfsd_courses WHERE id = %d", $course_id
    ) );

    wp_send_json_success( [
        'id'            => $wpdb->insert_id,
        'student_name'  => $student ? $student->display_name : 'Unknown',
        'course_name'   => $course  ? $course->course_name   : 'Unknown',
        'enrolled_date' => current_time( 'mysql' ),
    ] );
} );

add_action( 'wp_ajax_mfsd_cm_delete_enrolment', function () {
    check_ajax_referer( 'mfsd_cm_nonce', 'nonce' );
    if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'Unauthorised' );

    global $wpdb;
    $id = (int) ( $_POST['id'] ?? 0 );
    $wpdb->delete( "{$wpdb->prefix}mfsd_enrolments", [ 'id' => $id ] );
    wp_send_json_success();
} );
