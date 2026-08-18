/* jshint esversion: 6 */
jQuery(function ($) {
    'use strict';

    const { ajaxUrl, nonce } = mfsdCM;

    const TASK_COLSPAN = 11;

    // Populated from mfsd_cm_get_tasks each time a course is selected —
    // { [week]: title } — read by weekHeaderRow() for display.
    let weekTitles   = {};
    let currentCourseId = null;

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

    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function badgeCellHtml(badgeSlug, isRag) {
        const hasBadge = !!badgeSlug;
        if (!hasBadge && !isRag) return '—';
        return (hasBadge ? '🏅 ' + escHtml(badgeSlug) : '') + (isRag ? ' 🔥' : '');
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
                const $thumb = $cell.find('.mfsd-course-thumb');
                if ($thumb.length) {
                    $thumb.attr('src', url);
                } else {
                    $cell.find('.mfsd-course-thumb-placeholder').replaceWith(
                        `<img src="${escHtml(url)}" class="mfsd-course-thumb" alt="">`
                    );
                }
                $btn.text('↺ Change');

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
        currentCourseId = course_id || null;
        if (!course_id) { $('#mfsd-task-order-container').hide(); return; }
        loadTasks(course_id);
    });

    function loadTasks(course_id) {
        ajax('mfsd_cm_get_tasks', { course_id }, data => {
            weekTitles = data.week_titles || {};
            renderTaskRows(data.tasks || []);
            $('#mfsd-task-order-container').show();
        }, msg => alert(msg));
    }

    function renderTaskRows(tasks) {
        const $tbody = $('#mfsd-sortable-tasks');
        $tbody.empty();

        if (!tasks.length) {
            $tbody.append(`<tr><td colspan="${TASK_COLSPAN}" style="text-align:center;color:#999;">No tasks yet — add one below.</td></tr>`);
            return;
        }

        let seqNo       = 1;
        let currentWeek = null;

        tasks.forEach(t => {
            const week = parseInt(t.week);
            if (week !== currentWeek) {
                currentWeek = week;
                $tbody.append(weekHeaderRow(week));
            }
            const coinVal      = t.coin_value != null ? parseInt(t.coin_value) : 10;
            const shimmerOn    = t.shimmer_enabled == 1;
            const shimmerIval  = t.shimmer_interval != null ? parseInt(t.shimmer_interval) : 5;
            const $row = $(`
                <tr data-id="${t.id}" data-week="${week}" data-task-no="${t.task_no}">
                    <td class="mfsd-drag-handle" title="Drag to reorder">⠿</td>
                    <td class="seq-no">${seqNo++}</td>
                    <td class="task-week-display">Week ${week}</td>
                    <td class="task-no-display">${t.task_no}</td>
                    <td class="task-name-display">${escHtml(t.display_name)}</td>
                    <td><code>${escHtml(t.task_slug)}</code></td>
                    <td class="task-badge-display">${badgeCellHtml(t.badge_slug, t.is_rag == 1)}</td>
                    <td class="task-coin-display" style="text-align:center;">${coinVal}</td>
                    <td class="task-shimmer-cell">
                        <label style="display:flex;align-items:center;gap:4px;white-space:nowrap;">
                            <input type="checkbox" class="mfsd-inline-shimmer-enabled" data-id="${t.id}" ${shimmerOn ? 'checked' : ''}>
                            <input type="number" class="mfsd-inline-shimmer-interval" data-id="${t.id}" value="${shimmerIval}" min="2" max="30" style="width:45px;" ${shimmerOn ? '' : 'disabled'}>
                        </label>
                    </td>
                    <td><span class="mfsd-status-badge ${t.active == 1 ? 'badge-active' : 'badge-inactive'}">${t.active == 1 ? 'Active' : 'Off'}</span></td>
                    <td>
                        <button class="button button-small mfsd-edit-task" data-id="${t.id}">Edit</button>
                        <button class="button button-small mfsd-toggle-task" data-id="${t.id}" data-active="${t.active}">${t.active == 1 ? 'Deactivate' : 'Activate'}</button>
                        <button class="button button-small button-link-delete mfsd-delete-task" data-id="${t.id}">Delete</button>
                    </td>
                </tr>
            `);
            $row.data('display-name', t.display_name);
            $row.data('badge-slug', t.badge_slug || '');
            $row.data('badge-image', t.badge_image || '');
            $row.data('coin-value', t.coin_value != null ? parseInt(t.coin_value) : 10);
            $row.data('is-rag', t.is_rag == 1);
            $row.data('counts', t.counts_for_week_badge == 1);
            $row.data('shimmer-enabled', shimmerOn);
            $row.data('shimmer-interval', shimmerIval);
            $tbody.append($row);
        });

        initSortable();
    }

    function weekHeaderRow(week) {
        const title = weekTitles[week] || ('Week ' + week);
        return `<tr class="mfsd-week-header" data-week="${week}"><td colspan="${TASK_COLSPAN}">
            📅 <span class="mfsd-week-title-text" data-week="${week}" title="Click to rename">${escHtml(title)}</span>
        </td></tr>`;
    }

    function refreshWeekHeaders() {
        $('#mfsd-sortable-tasks .mfsd-week-header').remove();
        let currentWeek = null;
        $('#mfsd-sortable-tasks tr[data-id]').each(function () {
            const week = parseInt($(this).data('week'));
            if (week !== currentWeek) {
                currentWeek = week;
                $(this).before(weekHeaderRow(week));
            }
        });
    }

    // ── Editable week titles ───────────────────

    $(document).on('click', '.mfsd-week-title-text', function () {
        const $span = $(this);
        if ($span.data('editing')) return;
        $span.data('editing', true);

        const week    = parseInt($span.data('week'));
        const current = $span.text();

        const $input = $(`<input type="text" class="mfsd-week-title-input" value="${escHtml(current)}" style="width:320px;">`);
        $span.replaceWith($input);
        $input.trigger('focus').trigger('select');

        const save = () => {
            const newTitle = $input.val().trim();
            const $restored = $(`<span class="mfsd-week-title-text" data-week="${week}" title="Click to rename">${escHtml(newTitle || ('Week ' + week))}</span>`);
            $input.replaceWith($restored);

            if (!newTitle || newTitle === (weekTitles[week] || ('Week ' + week))) return;
            if (!currentCourseId) return;

            ajax('mfsd_cm_save_week_title', { course_id: currentCourseId, week, title: newTitle }, () => {
                weekTitles[week] = newTitle;
            }, msg => {
                alert('Could not save week title: ' + msg);
                $restored.text(weekTitles[week] || ('Week ' + week));
            });
        };

        $input.on('blur', save);
        $input.on('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $input.trigger('blur'); }
            if (e.key === 'Escape') {
                e.preventDefault();
                $input.replaceWith(`<span class="mfsd-week-title-text" data-week="${week}" title="Click to rename">${escHtml(current)}</span>`);
            }
        });
    });

    function weekSelect(selected) {
        let opts = '';
        for (let w = 1; w <= 6; w++) {
            opts += `<option value="${w}"${w === selected ? ' selected' : ''}>Week ${w}</option>`;
        }
        return `<select class="mfsd-edit-week">${opts}</select>`;
    }

    function initSortable() {
        const $tbody = $('#mfsd-sortable-tasks');
        if ($tbody.hasClass('ui-sortable')) $tbody.sortable('destroy');

        $tbody.sortable({
            handle: '.mfsd-drag-handle',
            items:  'tr[data-id]',
            cancel: '.mfsd-week-header, .mfsd-edit-detail-row',
            axis:   'y',
            stop: function (e, ui) {
                const $row    = ui.item;
                const $hdr    = $row.prevAll('.mfsd-week-header').first();
                const newWeek = $hdr.length ? parseInt($hdr.data('week')) : 1;

                $row.data('week', newWeek).attr('data-week', newWeek);
                $row.find('.task-week-display').text('Week ' + newWeek);

                $(this).find('tr[data-id]').each(function (i) {
                    $(this).find('.seq-no').text(i + 1);
                });

                refreshWeekHeaders();
            }
        });
    }

    // ── Save Order ─────────────────────────────

    $('#mfsd-save-order').on('click', function () {
        const $msg = $('#mfsd-order-message');
        const rows = [];
        $('#mfsd-sortable-tasks tr[data-id]').each(function () {
            rows.push({ id: $(this).data('id'), week: $(this).data('week') });
        });

        ajax('mfsd_cm_save_order', { rows }, () => {
            showMsg($msg, 'Order saved.', false);
        }, msg => showMsg($msg, msg, true));
    });

    // ── Add Task — badge image picker ──────────

    let newTaskMediaFrame = null;

    $('#new-task-badge-slug').on('input', function () {
        const hasSlug = $(this).val().trim().length > 0;
        $('#new-task-upload-badge-image').prop('disabled', !hasSlug);
        if (!hasSlug) {
            $('#new-task-badge-image').val('');
            $('#new-task-badge-image-preview').empty();
        }
    });

    $('#new-task-upload-badge-image').on('click', function (e) {
        e.preventDefault();
        if ($(this).prop('disabled')) return;

        if (newTaskMediaFrame) newTaskMediaFrame.close();

        newTaskMediaFrame = wp.media({
            title:    'Select Badge Image',
            button:   { text: 'Use this image' },
            multiple: false,
            library:  { type: 'image' },
        });

        newTaskMediaFrame.on('select', function () {
            const attachment = newTaskMediaFrame.state().get('selection').first().toJSON();
            $('#new-task-badge-image').val(attachment.url);
            $('#new-task-badge-image-preview').html(`<img src="${escHtml(attachment.url)}" class="mfsd-badge-thumb" alt="">`);
        });

        newTaskMediaFrame.open();
    });

    // ── Add Task ───────────────────────────────

    $('#mfsd-add-task').on('click', function () {
        const course_id    = $('#mfsd-course-select').val();
        const display_name = $('#new-task-name').val().trim();
        const task_slug    = $('#new-task-slug').val().trim();
        const week         = $('#new-task-week').val();
        const task_no      = $('#new-task-no').val();
        const badge_slug   = $('#new-task-badge-slug').val().trim();
        const badge_image  = $('#new-task-badge-image').val();
        const coin_value   = $('#new-task-coin-value').val();
        const counts_for_week_badge = $('#new-task-counts').is(':checked') ? 1 : 0;
        const is_rag       = $('#new-task-is-rag').is(':checked') ? 1 : 0;
        const shimmer_enabled  = $('#new-task-shimmer-enabled').is(':checked') ? 1 : 0;
        const shimmer_interval = $('#new-task-shimmer-interval').val();
        const $msg         = $('#mfsd-task-message');

        if (!display_name || !task_slug) {
            showMsg($msg, 'Display name and plugin slug are required.', true);
            return;
        }

        ajax('mfsd_cm_add_task', {
            course_id, display_name, task_slug, week, task_no,
            badge_slug, badge_image, coin_value, counts_for_week_badge, is_rag,
            shimmer_enabled, shimmer_interval,
        }, data => {
            $('#new-task-name, #new-task-slug, #new-task-badge-slug').val('');
            $('#new-task-badge-image').val('');
            $('#new-task-badge-image-preview').empty();
            $('#new-task-upload-badge-image').prop('disabled', true);
            $('#new-task-coin-value').val(10);
            $('#new-task-counts').prop('checked', true);
            $('#new-task-is-rag').prop('checked', false);
            $('#new-task-shimmer-enabled').prop('checked', false);
            $('#new-task-shimmer-interval').val(5);

            showMsg($msg, `Task "${display_name}" added.${data.warning ? ' ⚠️ ' + data.warning : ''}`, false);
            loadTasks(course_id);
        }, msg => showMsg($msg, msg, true));
    });

    // ── Delete Task ────────────────────────────

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
                refreshWeekHeaders();
            });
        }, msg => alert(msg));
    });

    // ── Toggle Task active/off ─────────────────

    $(document).on('click', '.mfsd-toggle-task', function () {
        const $btn   = $(this);
        const $row   = $btn.closest('tr');
        const id     = $btn.data('id');
        const active = parseInt($btn.data('active'));

        ajax('mfsd_cm_toggle_task', { id, active }, data => {
            const $badge = $row.find('.mfsd-status-badge');
            if (data.new_active) {
                $badge.removeClass('badge-inactive').addClass('badge-active').text('Active');
                $btn.text('Deactivate').data('active', 1);
            } else {
                $badge.removeClass('badge-active').addClass('badge-inactive').text('Off');
                $btn.text('Activate').data('active', 0);
            }
        }, msg => alert(msg));
    });

    // ── Inline Shimmer column — editable without opening Edit ──

    function saveInlineShimmer($row) {
        const id       = $row.data('id');
        const $enabled = $row.find('.mfsd-inline-shimmer-enabled');
        const $interval = $row.find('.mfsd-inline-shimmer-interval');
        const shimmer_enabled  = $enabled.is(':checked') ? 1 : 0;
        const shimmer_interval = $interval.val();

        $interval.prop('disabled', !shimmer_enabled);

        ajax('mfsd_cm_save_task_shimmer', { id, shimmer_enabled, shimmer_interval }, data => {
            $row.data('shimmer-enabled', !!data.shimmer_enabled);
            $row.data('shimmer-interval', data.shimmer_interval);
            $interval.val(data.shimmer_interval);
        }, msg => alert('Could not save shimmer setting: ' + msg));
    }

    $(document).on('change', '.mfsd-inline-shimmer-enabled', function () {
        saveInlineShimmer($(this).closest('tr'));
    });

    $(document).on('change', '.mfsd-inline-shimmer-interval', function () {
        saveInlineShimmer($(this).closest('tr'));
    });

    // ── Inline Edit ────────────────────────────

    function editDetailRow(id, badgeSlug, badgeImage, coinValue, isRag, counts, shimmerOn, shimmerInterval) {
        return $(`
            <tr class="mfsd-edit-detail-row" data-id="${id}">
                <td colspan="${TASK_COLSPAN}">
                    <div class="mfsd-form-grid">
                        <div>
                            <label>Badge Slug</label>
                            <input type="text" class="mfsd-edit-badge-slug regular-text" value="${escHtml(badgeSlug)}">
                        </div>
                        <div>
                            <label>Badge Image</label>
                            <div class="mfsd-edit-badge-image-wrap">
                                <input type="hidden" class="mfsd-edit-badge-image" value="${escHtml(badgeImage)}">
                                <div class="mfsd-badge-image-preview">${badgeImage ? `<img src="${escHtml(badgeImage)}" class="mfsd-badge-thumb" alt="">` : ''}</div>
                                <button type="button" class="button button-small mfsd-upload-edit-badge-image" ${badgeSlug ? '' : 'disabled'}>+ Add Image</button>
                            </div>
                        </div>
                        <div>
                            <label>Coin Value</label>
                            <input type="number" class="mfsd-edit-coin-value" value="${coinValue}" min="0" max="999" style="width:70px;">
                        </div>
                        <div>
                            <label><input type="checkbox" class="mfsd-edit-counts" ${counts ? 'checked' : ''}> Counts toward week badge</label>
                        </div>
                        <div>
                            <label><input type="checkbox" class="mfsd-edit-is-rag" ${isRag ? 'checked' : ''}> This is the week's RAG reflection task</label>
                        </div>
                        <div>
                            <label><input type="checkbox" class="mfsd-edit-shimmer-enabled" ${shimmerOn ? 'checked' : ''}> Shimmer Sweep enabled</label>
                        </div>
                        <div>
                            <label>Shimmer Interval (seconds)</label>
                            <input type="number" class="mfsd-edit-shimmer-interval" value="${shimmerInterval}" min="2" max="30" style="width:70px;">
                        </div>
                    </div>
                </td>
            </tr>
        `);
    }

    $(document).on('click', '.mfsd-edit-task', function () {
        const $row = $(this).closest('tr');
        if ($row.hasClass('mfsd-editing')) return;

        const week   = parseInt($row.data('week'));
        const taskNo = parseInt($row.data('task-no'));
        const name   = $row.data('display-name');
        const id     = $row.data('id');

        $row.addClass('mfsd-editing');
        $row.find('.task-week-display').html(weekSelect(week));
        $row.find('.task-no-display').html(
            `<input type="number" class="mfsd-edit-task-no" value="${taskNo}" min="1" max="99" style="width:55px;">`
        );
        $row.find('.task-name-display').html(
            `<input type="text" class="mfsd-edit-name" value="${escHtml(name)}" style="width:160px;">`
        );

        const $detail = editDetailRow(
            id,
            $row.data('badge-slug') || '',
            $row.data('badge-image') || '',
            $row.data('coin-value') != null ? $row.data('coin-value') : 10,
            !!$row.data('is-rag'),
            !!$row.data('counts'),
            !!$row.data('shimmer-enabled'),
            $row.data('shimmer-interval') != null ? $row.data('shimmer-interval') : 5
        );
        $row.after($detail);

        $(this)
            .text('Save')
            .removeClass('mfsd-edit-task')
            .addClass('mfsd-save-task')
            .after('<button class="button button-small mfsd-cancel-edit" style="margin-left:4px;">Cancel</button>');
    });

    $(document).on('input', '.mfsd-edit-badge-slug', function () {
        const $detail = $(this).closest('.mfsd-edit-detail-row');
        const hasSlug = $(this).val().trim().length > 0;
        $detail.find('.mfsd-upload-edit-badge-image').prop('disabled', !hasSlug);
    });

    let editBadgeMediaFrame = null;

    $(document).on('click', '.mfsd-upload-edit-badge-image', function (e) {
        e.preventDefault();
        if ($(this).prop('disabled')) return;
        const $detail = $(this).closest('.mfsd-edit-detail-row');

        if (editBadgeMediaFrame) editBadgeMediaFrame.close();

        editBadgeMediaFrame = wp.media({
            title:    'Select Badge Image',
            button:   { text: 'Use this image' },
            multiple: false,
            library:  { type: 'image' },
        });

        editBadgeMediaFrame.on('select', function () {
            const attachment = editBadgeMediaFrame.state().get('selection').first().toJSON();
            $detail.find('.mfsd-edit-badge-image').val(attachment.url);
            $detail.find('.mfsd-badge-image-preview').html(`<img src="${escHtml(attachment.url)}" class="mfsd-badge-thumb" alt="">`);
        });

        editBadgeMediaFrame.open();
    });

    $(document).on('click', '.mfsd-cancel-edit', function () {
        const $row   = $(this).closest('tr');
        const week   = parseInt($row.data('week'));
        const taskNo = parseInt($row.data('task-no'));
        const name   = $row.data('display-name');

        $row.next('.mfsd-edit-detail-row').remove();
        $row.removeClass('mfsd-editing');
        $row.find('.task-week-display').text('Week ' + week);
        $row.find('.task-no-display').text(taskNo);
        $row.find('.task-name-display').text(name);
        $row.find('.mfsd-save-task')
            .prop('disabled', false)
            .text('Edit')
            .removeClass('mfsd-save-task')
            .addClass('mfsd-edit-task');
        $(this).remove();
    });

    $(document).on('click', '.mfsd-save-task', function () {
        const $btn    = $(this);
        const $row    = $btn.closest('tr');
        const $detail = $row.next('.mfsd-edit-detail-row');
        const id      = parseInt($row.data('id'));
        const week    = parseInt($row.find('.mfsd-edit-week').val());
        const taskNo  = parseInt($row.find('.mfsd-edit-task-no').val());
        const name    = $row.find('.mfsd-edit-name').val().trim();

        const badge_slug  = $detail.find('.mfsd-edit-badge-slug').val().trim();
        const badge_image = $detail.find('.mfsd-edit-badge-image').val();
        const coin_value  = $detail.find('.mfsd-edit-coin-value').val();
        const counts_for_week_badge = $detail.find('.mfsd-edit-counts').is(':checked') ? 1 : 0;
        const is_rag      = $detail.find('.mfsd-edit-is-rag').is(':checked') ? 1 : 0;
        const shimmer_enabled  = $detail.find('.mfsd-edit-shimmer-enabled').is(':checked') ? 1 : 0;
        const shimmer_interval = $detail.find('.mfsd-edit-shimmer-interval').val();

        if (!name) { alert('Display name is required.'); return; }

        $btn.prop('disabled', true).text('Saving…');

        ajax('mfsd_cm_update_task', {
            id, week, task_no: taskNo, display_name: name,
            badge_slug, badge_image, coin_value, counts_for_week_badge, is_rag,
            shimmer_enabled, shimmer_interval,
        }, data => {
            $row.data('week', week).attr('data-week', week);
            $row.data('task-no', taskNo).attr('data-task-no', taskNo);
            $row.data('display-name', name);
            $row.data('badge-slug', badge_slug);
            $row.data('badge-image', badge_image);
            $row.data('coin-value', parseInt(coin_value));
            $row.data('is-rag', !!is_rag);
            $row.data('counts', !!counts_for_week_badge);
            $row.data('shimmer-enabled', !!shimmer_enabled);
            $row.data('shimmer-interval', parseInt(shimmer_interval));

            $row.removeClass('mfsd-editing');
            $row.find('.task-week-display').text('Week ' + week);
            $row.find('.task-no-display').text(taskNo);
            $row.find('.task-name-display').text(name);
            $row.find('.task-badge-display').html(badgeCellHtml(badge_slug, !!is_rag));
            $row.find('.task-coin-display').text(parseInt(coin_value));
            $row.find('.mfsd-inline-shimmer-enabled').prop('checked', !!shimmer_enabled);
            $row.find('.mfsd-inline-shimmer-interval').val(parseInt(shimmer_interval)).prop('disabled', !shimmer_enabled);
            $btn.prop('disabled', false)
                .text('Edit')
                .removeClass('mfsd-save-task')
                .addClass('mfsd-edit-task');
            $row.find('.mfsd-cancel-edit').remove();
            $detail.remove();

            refreshWeekHeaders();

            if (data.warning) alert(data.warning);
        }, msg => {
            alert('Could not save: ' + msg);
            $btn.prop('disabled', false).text('Save');
        });
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
});
