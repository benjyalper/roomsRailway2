$(document).ready(function () {
    setupNavigation();
    if ($('#room-grid').length) initHome();
    if ($('#scheduleGrid').length) initSchedule();
    if ($('#roomForm').length) initRoomForm();
    if ($('#messageList').length) displayLast10Messages();
});

function setupNavigation() {
    $('#nav-schedule').click(() => { window.location.href = '/room-schedule.html'; });
    $('#nav-edit').click(() => { window.location.href = '/room-form.html'; });
    $('#nav-messages').click(() => { window.location.href = '/messages.html'; });
    $('#nav-signout').click(() => {
        Swal.fire({
            title: 'להתנתק?',
            showCancelButton: true,
            confirmButtonText: 'כן',
            cancelButtonText: 'לא'
        }).then(r => {
            if (r.isConfirmed) window.location.href = '/signin';
        });
    });
    $('#backHome').click(() => { window.location.href = '/home.html'; });
}

function initHome() {
    const $grid = $('#room-grid').empty();
    for (let i = 1; i <= 10; i++) {
        $grid.append(`<div class="room" data-room-number="${i}"><div class="room-number">חדר ${i}</div></div>`);
    }
    $('.room').click(function () {
        window.location.href = `/room/${$(this).data('room-number')}`;
    });
}

function initSchedule() {
    $('#lookupDate').val(moment().format('YYYY-MM-DD')).change(fetchDataByDate);
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
    const rooms = 10;
    const $g = $('#scheduleGrid').empty().css({
        display: 'grid',
        gridTemplateColumns: `auto repeat(${rooms},1fr)`,
        gap: '1px'
    });

    // headers
    $g.append(`<div class="header-cell"></div>`);
    for (let r = 1; r <= rooms; r++) $g.append(`<div class="header-cell">חדר ${r}</div>`);

    // rows
    times.forEach(t => {
        $g.append(`<div class="header-cell">${t.slice(0, 5)}</div>`);
        for (let r = 1; r <= rooms; r++) {
            $g.append(`<div class="grid-cell" data-room-hour="${r} ${t}"></div>`);
        }
    });
}

function fetchDataByDate() {
    fetch(`/fetchDataByDate?date=${encodeURIComponent($('#lookupDate').val())}`, {
        headers: { Accept: 'application/json' }
    })
        .then(r => r.ok ? r.json() : Promise.reject(r.status))
        .then(updateScheduleGrid)
        .catch(() => Swal.fire('שגיאה בטעינת נתוני החדרים'));
}

function updateScheduleGrid(rows) {
    $('.grid-cell').removeAttr('style').empty();
    (rows || []).forEach(r => {
        const sel = `[data-room-hour="${r.roomNumber} ${r.startTime}"]`;
        const end = `[data-room-hour="${r.roomNumber} ${r.endTime}"]`;
        const $s = $(sel), $e = $(end);
        const $cells = $s.nextUntil($e).addBack();
        $cells.css({ backgroundColor: r.color, border: `2px solid ${r.color}` });
        $cells.eq(Math.floor($cells.length / 2)).html(`<div class="therapist-name">${r.names}</div>`);
        $cells.attr('title', `מטפל/ת: ${r.names}\nחדר: ${r.roomNumber}`).tooltip();
        $cells.click(() => confirmDelete(r, $('#lookupDate').val()));
    });
}

function confirmDelete(r, date) {
    Swal.fire({
        title: 'האם להסיר פגישה זו?',
        showCancelButton: true,
        confirmButtonText: 'כן',
        cancelButtonText: 'לא'
    }).then(res => {
        if (res.isConfirmed) deleteEntry(date, r.roomNumber, r.startTime, r.endTime).then(fetchDataByDate);
    });
}

function deleteEntry(d, room, start, end) {
    return fetch('/deleteEntry', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_date: d, roomNumber: room, startTime: start, endTime: end })
    });
}

function initRoomForm() {
    $('#startTime').change(updateEndTimeOptions);
    updateEndTimeOptions();
    $('#recurringEvent').change(() => {
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
        await fetch('/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        Swal.fire('נשמר!', '', 'success');
        $('#roomForm')[0].reset();
        updateEndTimeOptions();
    });
}

function updateEndTimeOptions() {
    const s = $('#startTime').val();
    const opts = ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    $('#endTime').empty().append(opts.filter(t => moment(t, 'HH:mm').isAfter(moment(s, 'HH:mm'))).map(t => `<option>${t}</option>`));
}
