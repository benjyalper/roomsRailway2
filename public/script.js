

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
    $('#nav-signout').click(() => {
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
    // 1) Set the date picker to today
    const today = moment().format('YYYY-MM-DD');
    $('#lookupDate')
        .val(today)
        .off('change')            // remove any old handlers
        .on('change', fetchDataByDate);

    // 2) Load data for today
    fetchDataByDate();
}

function fetchDataByDate() {
    const date = $('#lookupDate').val();
    fetch(`/fetchDataByDate?date=${encodeURIComponent(date)}`, {
        headers: { Accept: 'application/json' }
    })
        .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
        .then(updateScheduleGrid)
        .catch(() => Swal.fire('שגיאה בטעינת נתוני החדרים'));
}

function updateScheduleGrid(rows) {
    // Clear styling, content and classes from all existing table cells
    $(‘#scheduleTable td.grid-cell’)
        .removeAttr(‘style’)
        .removeClass(‘occupied empty-slot’)
        .off(‘click mouseenter mouseleave’)
        .empty();

    // For each booking, find the matching cells and color them
    (rows || []).forEach(r => {
        const selector = `[data-room-hour="${r.roomNumber} ${r.startTime}"]`;
        // Actually we need all cells whose data-room-hour time is between startTime (inclusive) and endTime (exclusive):
        const $cells = $(‘#scheduleTable td.grid-cell’).filter(function () {
            const [room, time] = $(this).data(‘room-hour’).split(‘ ‘);
            return (
                room === String(r.roomNumber) &&
                time >= r.startTime &&
                time < r.endTime
            );
        });

        // Mark as occupied so empty-slot handler can skip them
        $cells.addClass(‘occupied’);

        // Style the range of cells
        $cells.css({
            backgroundColor: r.color,
            border: `2px solid ${r.color}`
        });

        // Show the therapist’s name in the middle cell
        const $middle = $cells.eq(Math.floor($cells.length / 2));
        $middle.append(`<div class="therapist-name">${r.names}</div>`);

        // Tooltip + click‐to‐delete
        $cells
            .off(‘click’)
            .on(‘click’, () => {
                Swal.fire({
                    title: ‘בחר פעולה’,
                    showDenyButton: true,
                    showCancelButton: true,
                    confirmButtonText: ‘מחק פגישה זו’,
                    denyButtonText: ‘מחק את כל הפגישות הבאות’,
                    cancelButtonText: ‘בטל’
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

    // ── Empty-slot click: redirect to עריכה with pre-filled params ──────────
    $(‘#scheduleTable td.grid-cell:not(.occupied)’).each(function () {
        const $cell = $(this);
        $cell
            .addClass(‘empty-slot’)
            .css(‘cursor’, ‘pointer’)
            .on(‘mouseenter’, function () {
                $(this).css(‘backgroundColor’, ‘rgba(121,194,179,0.18)’);
            })
            .on(‘mouseleave’, function () {
                $(this).css(‘backgroundColor’, ‘’);
            })
            .on(‘click’, function () {
                const roomHour  = $(this).data(‘room-hour’);       // e.g. "1 08:00:00"
                const parts     = roomHour.split(‘ ‘);
                const room      = parts[0];
                const startTime = parts[1].slice(0, 5);            // "08:00"
                const date      = $(‘#lookupDate’).val();
                window.location.href =
                    `/room-form?date=${encodeURIComponent(date)}&room=${encodeURIComponent(room)}&startTime=${encodeURIComponent(startTime)}`;
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
