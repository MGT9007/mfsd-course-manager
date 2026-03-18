/* jshint esversion: 6 */
jQuery(function ($) {
    'use strict';

    const { ajaxUrl, nonce } = mfsdCM;

    // ─────────────────────────────────────────
    // HELPER: show message
    // ─────────────────────────────────────────
    function showMsg($el, msg, isError) {
        $el.text(msg)
           .removeClass('msg-success msg-error')
           .addClass(isError ? 'msg-error' : 'msg-success')
           .show();
        setTimeout(() => $el.fadeOut(), 4000);
    }

    function ajax(action, data, done, fail) {
        $.post(ajaxUrl, { action, nonce, ...data })
         .done(res => {
             if (res.success) { done(res.data); }
             else             { fail && fail(res.data || 'An error occurred.'); }
         })
         .fail(() => fail && fail('Server error — please try again.'));
    }

    // ─────────────────────────────────────────
    // TAB: COURSES — image upload via WP media
    // ─────────────────────────────────────────

    let mediaFrame = null;

    $(document).on('click', '.mfsd-upload-image', function (e) {
        e.preventDefault();
        const $btn  = $(this);
        const id    = $btn.data('id');
        const $cell = $btn.closest('.mfsd-course-thumb-cell');

        // Open / reuse the WP media library frame
        if (mediaFrame) mediaFrame.close();

        mediaFrame = wp.media({
            title:    'Select Course Image',
            button:   { text: 'Use this image' },
            multiple: false,
            library:  { type: 'image' },
        });

        mediaFrame.on('select', function () {
            const attachment = mediaFrame.state().get('selection').first().toJSON();
            const url = attachment.url;

            ajax('mfsd_cm_save_course_image', { id, image_url: url }, () => {
                // Update thumbnail in the table row immediately
                const $thumb = $cell.find('.mfsd-course-thumb');
                if ($thumb.length) {
                    $thumb.attr('src', url);
                } else {
                    $cell.find('.mfsd-course-thumb-placeholder').replaceWith(
                        `<img src="${escHtml(url)}" class="mfsd-course-thumb" alt="">`
                    );
                }
                $btn.text('↺ Change');

                // Add Remove button if not already there
                if (!$cell.find('.mfsd-remove-image').length) {
                    $btn.after(
                        `<button class="button button-small button-link-delete mfsd-remove-image"
                                 data-id="${id}"
                                 style="margin-top:4px;display:block;">Remove</button>`
                    );
                }
            }, msg => alert('Could not save image: ' + msg));
        });

        mediaFrame.open();
    });

    // Remove course image
    $(document).on('click', '.mfsd-remove-image', function (e) {
        e.preventDefault();
        if (!confirm('Remove this course image?')) return;
        const $btn  = $(this);
        const id    = $btn.data('id');
        const $cell = $btn.closest('.mfsd-course-thumb-cell');

        ajax('mfsd_cm_save_course_image', { id, image_url: '' }, () => {
            $cell.find('.mfsd-course-thumb').replaceWith(
                '<div class="mfsd-course-thumb-placeholder">No image</div>'
            );
            $cell.find('.mfsd-upload-image').text('+ Add Image');
            $btn.remove();
        }, msg => alert('Could not remove image: ' + msg));
    });

    // ─────────────────────────────────────────
    // TAB: COURSES — add / toggle / delete
    // ─────────────────────────────────────────

    $('#mfsd-add-course').on('click', function () {
        const name = $('#new-course-name').val().trim();
        const slug = $('#new-course-slug').val().trim();
        const $msg = $('#mfsd-course-message');

        if (!name || !slug) {
            showMsg($msg, 'Please enter both a name and a slug.', true);
            return;
        }

        ajax('mfsd_cm_add_course', { course_name: name, course_slug: slug }, data => {
            const $tbody = $('#mfsd-courses-table tbody');
            $tbody.find('td[colspan]').closest('tr').remove();

            $tbody.append(`
                <tr data-id="${data.id}">
                    <td>${data.id}</td>
                    <td class="mfsd-course-thumb-cell">
                        <div class="mfsd-course-thumb-placeholder">No image</div>
                        <button class="button button-small mfsd-upload-image"
                                data-id="${data.id}"
                                style="margin-top:6px;display:block;">+ Add Image</button>
                    </td>
                    <td class="editable-name">${escHtml(data.course_name)}</td>
                    <td><code>${escHtml(data.course_slug)}</code></td>
                    <td><span class="mfsd-status-badge badge-active">Active</span></td>
                    <td>
                        <button class="button button-small mfsd-toggle-course"
                                data-id="${data.id}" data-active="1">Deactivate</button>
                        <button class="button button-small button-link-delete mfsd-delete-course"
                                data-id="${data.id}">Delete</button>
                    </td>
                </tr>
            `);

            $('#new-course-name, #new-course-slug').val('');
            showMsg($msg, `Course "${data.course_name}" added.`, false);
        }, msg => showMsg($msg, msg, true));
    });

    $(document).on('click', '.mfsd-toggle-course', function () {
        const $btn   = $(this);
        const id     = $btn.data('id');
        const active = parseInt($btn.data('active'));

        ajax('mfsd_cm_toggle_course', { id, active }, data => {
            const $row   = $btn.closest('tr');
            const $badge = $row.find('.mfsd-status-badge');
            if (data.new_active) {
                $badge.removeClass('badge-inactive').addClass('badge-active').text('Active');
                $btn.text('Deactivate').data('active', 1);
            } else {
                $badge.removeClass('badge-active').addClass('badge-inactive').text('Inactive');
                $btn.text('Activate').data('active', 0);
            }
        }, msg => alert(msg));
    });

    $(document).on('click', '.mfsd-delete-course', function () {
        if (!confirm('Delete this course? This will also remove all associated tasks. Student progress records are retained.')) return;
        const $btn = $(this);
        const id   = $btn.data('id');

        ajax('mfsd_cm_delete_course', { id }, () => {
            $btn.closest('tr').fadeOut(300, function () { $(this).remove(); });
        }, msg => alert(msg));
    });

    // ─────────────────────────────────────────
    // TAB: TASK ORDER
    // ─────────────────────────────────────────

    $('#mfsd-course-select').on('change', function () {
        const course_id = $(this).val();
        if (!course_id) { $('#mfsd-task-order-container').hide(); return; }
        loadTasks(course_id);
    });

    function loadTasks(course_id) {
        ajax('mfsd_cm_get_tasks', { course_id }, data => {
            renderTaskRows(data);
            $('#mfsd-task-order-container').show();
        }, msg => alert(msg));
    }

    function renderTaskRows(tasks) {
        const $tbody = $('#mfsd-sortable-tasks');
        $tbody.empty();

        if (!tasks.length) {
            $tbody.append('<tr><td colspan="8" style="text-align:center;color:#999;">No tasks yet — add one below.</td></tr>');
            return;
        }

        tasks.forEach(t => {
            $tbody.append(`
                <tr data-id="${t.id}">
                    <td class="mfsd-drag-handle" title="Drag to reorder">⠿</td>
                    <td class="seq-no">${t.sequence_order}</td>
                    <td>Week ${t.week}</td>
                    <td>${t.task_no}</td>
                    <td>${escHtml(t.display_name)}</td>
                    <td><code>${escHtml(t.task_slug)}</code></td>
                    <td><span class="mfsd-status-badge ${t.active == 1 ? 'badge-active' : 'badge-inactive'}">${t.active == 1 ? 'Active' : 'Off'}</span></td>
                    <td>
                        <button class="button button-small button-link-delete mfsd-delete-task"
                                data-id="${t.id}">Delete</button>
                    </td>
                </tr>
            `);
        });

        initSortable();
    }

    function initSortable() {
        $('#mfsd-sortable-tasks').sortable({
            handle: '.mfsd-drag-handle',
            axis:   'y',
            update: function () {
                $(this).find('tr').each(function (i) {
                    $(this).find('.seq-no').text(i + 1);
                });
            }
        });
    }

    $('#mfsd-save-order').on('click', function () {
        const $msg  = $('#mfsd-order-message');
        const order = [];
        $('#mfsd-sortable-tasks tr[data-id]').each(function () {
            order.push($(this).data('id'));
        });

        ajax('mfsd_cm_save_order', { order }, () => {
            showMsg($msg, 'Order saved.', false);
        }, msg => showMsg($msg, msg, true));
    });

    $('#mfsd-add-task').on('click', function () {
        const course_id    = $('#mfsd-course-select').val();
        const display_name = $('#new-task-name').val().trim();
        const task_slug    = $('#new-task-slug').val().trim();
        const week         = $('#new-task-week').val();
        const task_no      = $('#new-task-no').val();
        const $msg         = $('#mfsd-task-message');

        if (!display_name || !task_slug) {
            showMsg($msg, 'Display name and plugin slug are required.', true);
            return;
        }

        ajax('mfsd_cm_add_task', { course_id, display_name, task_slug, week, task_no }, () => {
            $('#new-task-name, #new-task-slug').val('');
            showMsg($msg, `Task "${display_name}" added.`, false);
            loadTasks(course_id);
        }, msg => showMsg($msg, msg, true));
    });

    $(document).on('click', '.mfsd-delete-task', function () {
        if (!confirm('Delete this task from the course ordering?')) return;
        const $btn = $(this);
        const id   = $btn.data('id');

        ajax('mfsd_cm_delete_task', { id }, () => {
            $btn.closest('tr').fadeOut(300, function () {
                $(this).remove();
                $('#mfsd-sortable-tasks tr[data-id]').each(function (i) {
                    $(this).find('.seq-no').text(i + 1);
                });
            });
        }, msg => alert(msg));
    });

    // ─────────────────────────────────────────
    // TAB: PROGRESS
    // ─────────────────────────────────────────

    $('#mfsd-load-progress').on('click', function () {
        const course_id  = $('#progress-course-select').val();
        const student_id = $('#progress-student-select').val();

        ajax('mfsd_cm_get_progress', { course_id, student_id }, data => {
            renderProgressTable(data);
        }, msg => alert(msg));
    });

    function renderProgressTable(rows) {
        const $container = $('#mfsd-progress-container');

        if (!rows.length) {
            $container.html('<p style="color:#999;">No progress records match the selected filters.</p>');
            return;
        }

        const statusBadge = s => {
            const map   = { completed: 'badge-completed', in_progress: 'badge-inprogress', available: 'badge-available', not_started: 'badge-notstarted', locked: 'badge-locked' };
            const label = { completed: 'Completed', in_progress: 'In Progress', available: 'Available', not_started: 'Not Started', locked: 'Locked' };
            return `<span class="mfsd-status-badge ${map[s] || ''}">${label[s] || s}</span>`;
        };

        let html = `<table class="mfsd-table"><thead><tr>
            <th>Student</th><th>Task</th><th>Week</th><th>Seq</th>
            <th>Status</th><th>Started</th><th>Completed</th><th>Actions</th>
        </tr></thead><tbody>`;

        rows.forEach(r => {
            const started   = r.started_date   ? r.started_date.substring(0,10)   : '—';
            const completed = r.completed_date ? r.completed_date.substring(0,10) : '—';
            const resetBtn  = r.progress_id
                ? `<button class="button button-small button-link-delete mfsd-reset-task" data-id="${r.progress_id}">Reset</button>`
                : '—';

            html += `<tr data-progress="${r.progress_id || ''}">
                <td>${escHtml(r.student_name || '—')}</td>
                <td>${escHtml(r.display_name)}</td>
                <td>${r.week}</td><td>${r.sequence_order}</td>
                <td>${statusBadge(r.status)}</td>
                <td>${started}</td><td>${completed}</td>
                <td>${resetBtn}</td>
            </tr>`;
        });

        html += '</tbody></table>';
        $container.html(html);
    }

    $(document).on('click', '.mfsd-reset-task', function () {
        if (!confirm('Reset this task progress? The student will be able to restart it.')) return;
        const $btn        = $(this);
        const progress_id = $btn.data('id');

        ajax('mfsd_cm_reset_task', { progress_id }, () => {
            $btn.closest('tr').fadeOut(300, function () { $(this).remove(); });
        }, msg => alert(msg));
    });

    // ─────────────────────────────────────────
    // TAB: ENROLMENTS
    // ─────────────────────────────────────────

    $('#mfsd-add-enrolment').on('click', function () {
        const student_id = $('#enrol-student-select').val();
        const course_id  = $('#enrol-course-select').val();
        const $msg       = $('#mfsd-enrolment-message');

        if (!student_id || !course_id) {
            showMsg($msg, 'Please select both a student and a course.', true);
            return;
        }

        ajax('mfsd_cm_add_enrolment', { student_id, course_id }, data => {
            const $tbody = $('#mfsd-enrolments-body');
            $tbody.find('td[colspan]').closest('tr').remove();

            const date = data.enrolled_date.substring(0, 10);
            $tbody.prepend(`
                <tr data-id="${data.id}">
                    <td>${escHtml(data.student_name)}</td>
                    <td>${escHtml(data.course_name)}</td>
                    <td>${date}</td>
                    <td>
                        <button class="button button-small button-link-delete mfsd-delete-enrolment"
                                data-id="${data.id}">Remove</button>
                    </td>
                </tr>
            `);

            $('#enrol-student-select, #enrol-course-select').val('');
            showMsg($msg, `${data.student_name} enrolled on ${data.course_name}.`, false);
        }, msg => showMsg($msg, msg, true));
    });

    $(document).on('click', '.mfsd-delete-enrolment', function () {
        if (!confirm('Remove this enrolment record?')) return;
        const $btn = $(this);
        const id   = $btn.data('id');

        ajax('mfsd_cm_delete_enrolment', { id }, () => {
            $btn.closest('tr').fadeOut(300, function () { $(this).remove(); });
        }, msg => alert(msg));
    });

    // ─────────────────────────────────────────
    // UTILITY
    // ─────────────────────────────────────────
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
});