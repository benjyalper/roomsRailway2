

$(document).ready(function () {
    setupNavigation();
    if ($('#room-grid').length) initHome();
    if ($('#scheduleTable').length) initSchedule();      // ← look for the table
    if ($('#roomForm').length) initRoomForm();
    if ($('#messageList').length) displayLast10Messages();
});

function setupNavigation() {
    $('#nav-schedule').click(() => { window.location.href = '/room-schedule'; });
    $('#nav-edit').click(() => { window.location.href = '/room-form'; });
    $('#nav-messages').click(() => { window.location.href = '/messages'; });
    $('#nav-signout').click(e => {
        e.preventDefault();
        Swal.fire({
            title: 'להתנתק?',
            showCancelButton: true,
            confirmButtonText: 'כן',
            cancelButtonText: 'לא'
        }).then(r => { if (r.isConfirmed) window.location.href = '/logout'; });
    });
    $('#backHome').click(() => { window.location.href = '/home'; });
}

function initHome() {
    // 1) Define your rooms however you like:
    // const rooms = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', 'מקלט'];

    const rooms = Array.isArray(window.ROOMS) ? window.ROOMS : [];
    // 2) Grab & clear the grid container
    const $grid = $('#room-grid').empty();

    // 3) Render each room from the array
    rooms.forEach(label => {
        $grid.append(`
      <div class="room" data-room-number="${label}">
        <div class="room-number">${label}</div>
      </div>
    `);
    });

    // 4) Preserve the click behavior
    $('.room').click(function () {
        const room = $(this).data('room-number');
        window.location.href = `/room/${room}`;
    });
}

function initSchedule() {
    // 1) Set the date picker to today — use native Date, no moment dependency
    const today = new Date().toISOString().split('T')[0];   // "YYYY-MM-DD"
    $('#lookupDate')
        .val(today)
        .off('change')
        .on('change', function () {
            fetchDataByDate();
            updateHebrewDay(this.value);
        });

    updateHebrewDay(today);

    // 2) Pinch-to-snap zoom (touch devices only)
    initPinchZoom();

    // 4) Delegated click for empty slots — registered ONCE on the stable
    //    table element, fires for any :not(.occupied) cell at click time.
    //    This survives every updateScheduleGrid refresh automatically.
    $('#scheduleTable')
        .off('click.emptySlot')
        .on('click.emptySlot', 'td.grid-cell:not(.occupied)', function () {
            const parts     = $(this).data('room-hour').split(' ');
            const room      = parts[0];
            const startTime = parts[1].slice(0, 5);          // "08:00"
            const date      = $('#lookupDate').val();
            window.location.href =
                `/room-form?date=${encodeURIComponent(date)}&room=${encodeURIComponent(room)}&startTime=${encodeURIComponent(startTime)}`;
        });

    // 5) Load data for today
    fetchDataByDate();
}

// ─── Pinch-to-snap zoom ───────────────────────────────────────────────────────
// Snap levels: number of room columns visible simultaneously in the viewport.
// 0 is the special "show all" level (every room fits without scrolling).
// Only activated on touch devices; desktop behaviour is unchanged.
function initPinchZoom() {
    const wrapper = document.querySelector('.schedule-wrapper');
    if (!wrapper || !('ontouchstart' in window)) return;

    const SNAP_COLS  = [1, 2, 4, 6, 8, 0];   // 0 = all rooms
    const totalRooms = Array.isArray(window.ROOMS) ? window.ROOMS.length : 9;
    const TIME_COL_W = 80;                     // matches --time-col-width
    const MIN_COL_W  = 60;                     // never narrower than 60 px

    // Start at 4-column level
    let snapIdx = SNAP_COLS.indexOf(4);

    function colWidth(snapCols) {
        const showAll = snapCols === 0;
        const n       = showAll ? totalRooms : snapCols;
        const px      = Math.floor((wrapper.clientWidth - TIME_COL_W) / n);
        // For "show all", allow columns to go as narrow as they need to fit;
        // for every other level keep a readable 60 px floor.
        return showAll ? Math.max(28, px) : Math.max(MIN_COL_W, px);
    }

    // Font size per snap level: bigger columns → bigger, more readable names
    const SNAP_FONT = { 1: '1rem', 2: '0.85rem', 4: '0.72rem', 6: '0.65rem', 8: '0.58rem', 0: '0.52rem' };

    function applySnap(idx) {
        snapIdx = Math.max(0, Math.min(SNAP_COLS.length - 1, idx));
        const cols = SNAP_COLS[snapIdx];
        const w    = colWidth(cols);
        document.documentElement.style.setProperty('--col-width', w + 'px');
        document.documentElement.style.setProperty('--name-font-size', SNAP_FONT[cols] ?? '0.65rem');
        iosRepaintStickyCol();
    }

    // Apply default zoom on load
    applySnap(snapIdx);

    // Re-apply on orientation change / resize so widths stay accurate
    window.addEventListener('resize', () => applySnap(snapIdx));

    // ── Pinch gesture tracking ────────────────────────────────────────────────
    let startDist = null;
    let lastDist  = null;

    function touchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }

    // Non-passive so we can call preventDefault() and block native iOS zoom
    wrapper.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            startDist = touchDist(e.touches);
            lastDist  = startDist;
        }
    }, { passive: false });

    wrapper.addEventListener('touchmove', e => {
        if (e.touches.length === 2) {
            e.preventDefault();           // ← blocks native pinch-zoom
            if (startDist !== null) lastDist = touchDist(e.touches);
        }
    }, { passive: false });

    wrapper.addEventListener('touchend', e => {
        if (startDist === null) return;
        const delta = lastDist - startDist;

        if (Math.abs(delta) > 30) {        // ignore tiny accidental touches
            if (delta > 0) {
                applySnap(snapIdx - 1);    // spread → zoom in → fewer cols
            } else {
                applySnap(snapIdx + 1);    // pinch  → zoom out → more cols
            }
        }

        startDist = null;
        lastDist  = null;
    }, { passive: true });
}

// Updates the Hebrew day-name banner (only present on the schedule page)
function updateHebrewDay(dateStr) {
    const el = document.getElementById('hebrewDayName');
    if (!el) return;
    const HEB_DAYS = ["יום א'", "יום ב'", "יום ג'", "יום ד'", "יום ה'", "יום ו'", "יום ש'"];
    const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    el.textContent = HEB_DAYS[d.getDay()];
}

function fetchDataByDate() {
    const date = $('#lookupDate').val();
    fetch(`/fetchDataByDate?date=${encodeURIComponent(date)}`, {
        headers: { Accept: 'application/json' }
    })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(rows => { updateScheduleGrid(rows); iosRepaintStickyCol(); })
        .catch(() => Swal.fire('שגיאה בטעינת נתוני החדרים'));
}

// iOS Safari doesn't paint position:sticky cells inside overflow:auto until
// the first scroll event fires. Nudging scrollLeft by 1px and back triggers
// the paint without the user seeing any movement.
function iosRepaintStickyCol() {
    const w = document.querySelector('.schedule-wrapper');
    if (!w) return;
    requestAnimationFrame(() => {
        w.scrollLeft += 1;
        requestAnimationFrame(() => { w.scrollLeft -= 1; });
    });
}

function updateScheduleGrid(rows) {
    // Clear styling, content and classes from all existing table cells
    $('#scheduleTable td.grid-cell')
        .removeAttr('style')
        .removeClass('occupied empty-slot')
        .off('click mouseenter mouseleave')
        .empty();

    // For each booking, find the matching cells and color them
    (rows || []).forEach(r => {
        const selector = `[data-room-hour="${r.roomNumber} ${r.startTime}"]`;
        // Actually we need all cells whose data-room-hour time is between startTime (inclusive) and endTime (exclusive):
        const $cells = $('#scheduleTable td.grid-cell').filter(function () {
            const [room, time] = $(this).data('room-hour').split(' ');
            return (
                room === String(r.roomNumber) &&
                time >= r.startTime &&
                time < r.endTime
            );
        });

        // Mark as occupied so empty-slot handler can skip them
        $cells.addClass('occupied');

        // Style the range of cells
        $cells.css({
            backgroundColor: r.color,
            border: `2px solid ${r.color}`
        });

        // Show the therapist's name in the middle cell
        const $middle = $cells.eq(Math.floor($cells.length / 2));
        $middle.append(`<div class="therapist-name">${r.names}</div>`);

        // Tooltip + click‐to‐delete
        $cells
            .off('click')
            .on('click', () => {
                Swal.fire({
                    title: 'בחר פעולה',
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: 'מחק פגישה זו',
                    denyButtonText: 'מחק את כל הפגישות הבאות',
                    cancelButtonText: 'בטל'
                }).then(res => {
                    if (res.isConfirmed) {
                        deleteEntry(r.id).then(fetchDataByDate);
                    } else if (res.isDenied) {
                        deleteRecurring(r.selected_date, r.roomNumber, r.startTime)
                            .then(fetchDataByDate);
                    }
                });
            });
    });

}

function deleteEntry(id) {
    return fetch('/deleteEntry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
    });
}

function deleteRecurring(date, room, start) {
    return fetch('/deleteRecurring', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedDate: date, roomNumber: room, startTime: start })
    });
}

// ... the rest of your initRoomForm, messages, etc. remains unchanged ...


function initRoomForm() {
    console.log('initRoomForm sees window.TIMES =', window.TIMES);
    const $start = $('#startTime').empty();
    window.TIMES.forEach(t => $start.append(`<option value="${t}">${t}</option>`));
    $start.change(updateEndTimeOptions);
    updateEndTimeOptions();

    // ── Pre-fill from URL params (when arriving from an empty slot click) ───
    const params = new URLSearchParams(window.location.search);
    if (params.get('date'))      $('#selectedDate').val(params.get('date'));
    if (params.get('room'))      $('#roomNumber').val(params.get('room'));
    if (params.get('startTime')) {
        $('#startTime').val(params.get('startTime'));
        updateEndTimeOptions();   // sets endTime to the next slot (30 min later)
    }
    // Default to today if no date param supplied
    if (!params.get('date')) $('#selectedDate').val(moment().format('YYYY-MM-DD'));

    $('#recurringEvent').change(() => {
        $('#recurringOptions').css(
            'visibility',
            $('#recurringEvent').is(':checked') ? 'visible' : 'hidden'
        );
    });

    $('#roomForm').submit(async e => {
        e.preventDefault();
        const data = {
            selectedDate: $('#selectedDate').val(),
            names: $('#names').val(),
            selectedColor: $('#selectedColor').val(),
            startTime: $('#startTime').val(),
            endTime: $('#endTime').val(),
            roomNumber: $('#roomNumber').val(),
            recurringEvent: $('#recurringEvent').is(':checked'),
            recurringNum: $('#recurringNum').val()
        };

        // פנוי detection and message submission
        if (data.names.trim() === "פנוי") {
            const messageInput = `חדר ${data.roomNumber} פנוי בתאריך ${data.selectedDate} בשעות ${data.startTime} - ${data.endTime}`;
            await fetch('/submit_message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: messageInput })
            });
        }

        await fetch('/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        Swal.fire('נשמר!', '', 'success');
        $('#roomForm')[0].reset();
        updateEndTimeOptions();
    });

}

function updateEndTimeOptions() {
    const s = $('#startTime').val();
    const valid = TIMES.filter(t =>
        moment(t, 'HH:mm').isAfter(moment(s, 'HH:mm'))
    );
    $('#endTime').empty().append(valid.map(t => `<option>${t}</option>`));
}

function displayLast10Messages() {
    fetch('/get_last_messages')
        .then(r => r.json())
        .then(data => {
            const list = $('#messageList').empty();
            data.messages.forEach((msg, i) => {
                const item = $(`
          <div class="item list-group-item animate__fadeInRight" data-index="${i}">
            <div>${msg}</div>
          </div>
        `);
                const check = $(
                    '<i class="fas fa-check-square" style="color:lightgray;"></i>'
                ).click(() => check.css('color', 'limegreen'));
                const trash = $(
                    '<i class="fas fa-trash" style="color:darkgray;"></i>'
                ).click(() => deleteMessage(data.messageIds[i], item));
                item.append($('<div>').append(check, trash));
                list.append(item);
            });
        });
}

function submitMessage() {
    const input = $('#input').val().trim();
    if (!input) return Swal.fire('אי אפשר לשלוח הודעה ריקה');
    fetch('/submit_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
    })
        .then(r => r.json())
        .then(res => {
            const item = $(`
        <div class="item animate__animated animate__bounce">
          <div>${input}</div>
        </div>
      `).attr('data-id', res.messageId);
            const check = $(
                '<i class="fas fa-check-square" style="color:lightgray;"></i>'
            ).click(() => check.css('color', 'limegreen'));
            const trash = $(
                '<i class="fas fa-trash" style="color:darkgray;"></i>'
            ).click(() => deleteMessage(res.messageId, item));
            item.append($('<div>').append(check, trash));
            $('#messageList').prepend(item);
            $('#input').val('');
        });
}

function deleteMessage(messageId, item) {
    fetch('/delete_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
    }).then(r => {
        if (r.ok) {
            item.addClass('animate__slideOutLeft');
            setTimeout(() => item.remove(), 1000);
        } else {
            Swal.fire('שגיאה במחיקת ההודעה');
        }
    });
}
