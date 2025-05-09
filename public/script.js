// Main JavaScript for all pages
$(document).ready(function () {
    setupNavigation();
    if ($('#room-grid').length) initHome();
    if ($('#scheduleGrid').length) initSchedule();
    if ($('#roomForm').length) initRoomForm();
    if ($('#messageList').length) displayLast10Messages();
    if ($('#endTime').length) updateEndTimeOptions();
});

function setupNavigation() {
    $('#nav-schedule').click(() => {
        window.location.href = '/room-schedule.html';
    });
    $('#nav-edit').click(() => {
        window.location.href = '/room-form.html';
    });
    $('#nav-messages').click(() => {
        window.location.href = '/messages.html';
    });
    $('#nav-signout').click(() => {
        Swal.fire({
            title: 'להתנתק?',
            showCancelButton: true,
            confirmButtonText: 'כן',
            cancelButtonText: 'לא'
        }).then((r) => {
            if (r.isConfirmed) {
                window.location.href = '/signin';
            }
        });
    });
    $('#backHome').click(() => {
        window.location.href = '/home.html';
    });
}


function initHome() {
    const $grid = $('#room-grid').empty();
    for (let i = 1; i <= 10; i++) {
        const $room = $(`
      <div class="room" data-room-number="${i}">
        <div class="room-number">חדר ${i}</div>
      </div>
    `);
        $grid.append($room);
    }
    $('.room').on('click', function () {
        window.location.href = `/room/${$(this).data('room-number')}`;
    });
}

function initSchedule() {
    $('#lookupDate').val(moment().format('YYYY-MM-DD'));
    $('#lookupDate').on('change', fetchDataByDate);
    buildScheduleGrid();
    fetchDataByDate();
}

function buildScheduleGrid() {
    const times = [
        "07:00:00", "07:30:00", "08:00:00", "08:30:00",
        "09:00:00", "09:30:00", "10:00:00", "10:30:00",
        "11:00:00", "11:30:00", "12:00:00", "12:30:00",
        "13:00:00", "13:30:00", "14:00:00", "14:30:00",
        "15:00:00", "15:30:00", "16:00:00", "16:30:00",
        "17:00:00", "17:30:00"
    ];
    const roomCount = 10;
    const $grid = $('#scheduleGrid').empty().css({
        display: 'grid',
        gridTemplateColumns: `auto repeat(${roomCount}, 1fr)`,
        gap: '1px'
    });

    // Header row
    $grid.append(`<div class="header-cell"></div>`); // top-left corner
    for (let r = 1; r <= roomCount; r++) {
        $grid.append(`<div class="header-cell">חדר ${r}</div>`);
    }

    // Time rows
    times.forEach(time => {
        $grid.append(`<div class="header-cell">${time.slice(0, 5)}</div>`);
        for (let r = 1; r <= roomCount; r++) {
            $grid.append(`<div class="grid-cell" data-room-hour="${r} ${time}"></div>`);
        }
    });
}

function fetchDataByDate() {
    const date = $('#lookupDate').val();
    fetch(`/fetchDataByDate?date=${encodeURIComponent(date)}`, {
        headers: { 'Accept': 'application/json' }
    })
        .then(res => (!res.ok ? Promise.reject(res.status) : res.json()))
        .then(updateScheduleGrid)
        .catch(err => Swal.fire('שגיאה בטעינת נתוני החדרים'));
}

function updateScheduleGrid(results) {
    $('.grid-cell').removeAttr('style').empty();
    (results || []).forEach(r => {
        const selector = `[data-room-hour="${r.roomNumber} ${r.startTime}"]`;
        const endSelector = `[data-room-hour="${r.roomNumber} ${r.endTime}"]`;
        const $start = $(selector);
        const $end = $(endSelector);
        const $cells = $start.nextUntil($end).addBack();

        $cells.css({ 'background-color': r.color, border: `2px solid ${r.color}` });
        $cells.eq(Math.floor($cells.length / 2)).html(`<div class="therapist-name">${r.names}</div>`);
        $cells.attr('title', `מטפל/ת: ${r.names}\nחדר: ${r.roomNumber}`).tooltip();
        $cells.off('click').on('click', () => confirmDelete(r, $('#lookupDate').val()));
    });
}

function confirmDelete(r, date) {
    Swal.fire({
        title: 'האם להסיר פגישה זו?',
        showCancelButton: true,
        confirmButtonText: 'כן',
        cancelButtonText: 'לא'
    }).then(r2 => r2.isConfirmed && deleteEntry(date, r.roomNumber, r.startTime, r.endTime).then(fetchDataByDate));
}

function deleteEntry(date, room, start, end) {
    return fetch('/deleteEntry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_date: date, roomNumber: room, startTime: start, endTime: end })
    });
}

function initRoomForm() {
    updateEndTimeOptions();
    $('#startTime').on('change', updateEndTimeOptions);
    $('#recurringEvent').on('change', () => {
        $('#recurringOptions').css('visibility', $('#recurringEvent').is(':checked') ? 'visible' : 'hidden');
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
    const start = $('#startTime').val();
    if (!start) return;
    const options = [
        '07:30', '08:00', '08:30', '09:00', '09:30',
        '10:00', '10:30', '11:00', '11:30', '12:00',
        '12:30', '13:00', '13:30', '14:00', '14:30',
        '15:00', '15:30', '16:00', '16:30', '17:00',
        '17:30', '18:00', '18:30', '19:00'
    ];
    const valid = options.filter(t => moment(t, 'HH:mm').isAfter(moment(start, 'HH:mm')));
    $('#endTime').empty().append(valid.map(t => `<option value="${t}">${t}</option>`));
}

function displayLast10Messages() {
    fetch('/get_last_messages').then(r => r.json()).then(data => {
        const list = $('#messageList').empty();
        data.messages.forEach((msg, i) => {
            const item = $(`
        <div class="item list-group-item animate__fadeInRight" data-index="${i}">
          <div>${msg}</div>
        </div>
      `);
            const check = $('<i class="fas fa-check-square" style="color:lightgray;"></i>').click(() => check.css('color', 'limegreen'));
            const trash = $('<i class="fas fa-trash" style="color:darkgray;"></i>').click(() => deleteMessage(data.messageIds[i], item));
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
            const list = $('#messageList');
            const item = $(`<div class="item animate__animated animate__bounce"><div>${input}</div></div>`);
            const check = $('<i class="fas fa-check-square" style="color:lightgray;"></i>').click(() => check.css('color', 'limegreen'));
            const trash = $('<i class="fas fa-trash" style="color:darkgray;"></i>').click(() => deleteMessage(res.messageId, item));
            item.append($('<div>').append(check, trash)).attr('data-id', res.messageId);
            list.prepend(item);
            $('#input').val('');
        });
}

function deleteMessage(messageId, item) {
    fetch('/delete_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId })
    }).then(r => {
        if (r.ok) item.addClass('animate__slideOutLeft') && setTimeout(() => item.remove(), 1000);
        else Swal.fire('שגיאה במחיקת ההודעה');
    });
}
