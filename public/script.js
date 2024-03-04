$(document).ready(function () {
    let currentRoomNumber;

    $('.sign-out-link').on('click', function () {
        const signOutConfirmation = confirm('האם להתנתק?');
        if (signOutConfirmation) {
            $.ajax({
                type: 'GET',
                url: '/logout', // Adjust the URL based on your server configuration
                xhrFields: {
                    withCredentials: true // Include credentials (cookies) in the request
                },
                success: function (data) {
                    // If the logout is successful, you might want to redirect to a login page or update the UI
                    window.location.href = '/signin'; // Redirect to your login page
                },
                error: function (error) {
                    // Handle the case where logout was not successful
                    console.error('Logout failed:', error.statusText);
                }
            });
        } else {
            console.log("same user");
        }


    });


    $('.room').on('click', function () {
        const room = $(this).closest('.room');
        currentRoomNumber = $(room).data('room-number');
        console.log(currentRoomNumber)
        window.location.href = '/room/' + currentRoomNumber;
    });

    $('.back-btn').click(function () {
        window.location.href = '/home.html';
    });

    $('.now').click(function () {
        window.location.href = '/dateData/';
    });

    $('.room-schedule-link').click(function () {
        window.location.href = '/room-schedule.html';
    });

    $('.drop-down-to-room-form-link').click(function () {
        window.location.href = '/room-form.html';
    });

    $('.cat-link').click(function () {
        window.location.href = '/cat.html';
    });

    $('.cat').on('click', function () {
        alert("חתלתוללללל....!");
    });

    $('#lookupDate').val(moment().format('YYYY-MM-DD'));

    // Update end time options when start time changes
    $('#startTime').on('change', function () {
        updateEndTimeOptions();
    });
});

// Function to submit date
async function submitDate() {
    const selectedDate = $('#selectedDate').val();
    const names = $('#names').val();
    const selectedColor = $('#selectedColor').val();
    const startTime = $('#startTime').val();
    const endTime = $('#endTime').val();
    const roomNumber = $('#roomNumber').val();
    const recurringEvent = $('#recurringEvent').is(':checked');

    const response = await fetch('/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent }),
    });

    const result = await response.text();
    $('#message').text(result);

    // Log the submitted data to the console
    console.log(`Submitted Date: ${selectedDate}, Names: ${names}, Color: ${selectedColor}, Start Time: ${startTime}, End Time: ${endTime}, Room Number: ${roomNumber}, Recurring Event: ${recurringEvent}`);

    // Update end time options based on the selected start time
    updateEndTimeOptions();
}

// Function to update end time options based on the selected start time
function updateEndTimeOptions() {
    const startTime = $('#startTime').val();
    const endTimeSelect = $('#endTime');

    // Clear existing options
    endTimeSelect.empty();

    // Assuming you have a fixed set of available end times, adjust as needed
    const availableEndTimes = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '23:30'];

    // Filter available end times based on the selected start time
    const filteredEndTimes = availableEndTimes.filter(endTime => moment(endTime, 'HH:mm').isAfter(moment(startTime, 'HH:mm')));

    // Append new options to the select element
    filteredEndTimes.forEach(endTime => {
        endTimeSelect.append($('<option>', { value: endTime, text: endTime }));
    });
}


// Function to fetch data by date
async function fetchDataByDate() {
    const lookupDate = $('#lookupDate').val();
    $('#lookupDate').val(lookupDate);

    try {
        const results = await getDataByDate(lookupDate);

        // Clear the grid cells before updating
        clearGridCells();

        if (results.length > 0) {
            // Iterate through the results and update the grid cells
            results.forEach(result => {
                updateGridCells(result);
            });
        } else {
            $('#lookupResult').text(`No data found for ${lookupDate}.`);
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}
// Function to clear the grid cells
function clearGridCells() {
    $('.grid-cell').css({
        'background-color': 'white',
        'border': '1px solid black',
    });

    $('.frame').css({
        'background-color': 'rgb(235, 237, 236)'
    });
}

// Function to update the grid cells based on the result
function updateGridCells(result) {
    const cell = $(`.grid-cell[data-room-hour="${result.roomNumber} ${result.startTime}"]`);
    const nextCell = $(`.grid-cell[data-room-hour="${result.roomNumber} ${result.endTime}"]`);
    const cellsToColor = cell.nextUntil(nextCell).addBack().filter(`[data-room-hour^="${result.roomNumber}"]`);

    // Color the grid cells
    cellsToColor.css({
        'background-color': result.color,
        'border': `2px solid ${result.color}`,
    });

    // Find the middle cell in the colored area
    const middleCellIndex = Math.floor(cellsToColor.length / 2);
    const middleCell = cellsToColor.eq(middleCellIndex);

    // Add content to the cell
    const middleContent = '<div class="therapist-name" "style="font-size: 28px;">' + result.names + '</div>';
    middleCell.html(middleContent);

    cellsToColor.tooltip({
        title: 'מטפל/ת: ' + result.names + ' ' + 'חדר: ' + result.roomNumber + '<br>' + 'לחצ/י להסרה',
        placement: 'top',
        html: true
    });

    cellsToColor.off('click').on('click', function handleClick() {
        const selectedDate = $('#lookupDate').val(); // Use the selected date from the UI
        console.log(selectedDate);

        const deleteConfirmation = confirm('האם להסיר פגישה זו?');
        if (deleteConfirmation) {
            deleteEntry(selectedDate, result.roomNumber, result.startTime);
            // Unbind the click event to avoid multiple executions
            cellsToColor.off('click', handleClick);
        } else {
            console.log("No changes made to schedule");
        }
    });

}

// Function to delete an entry
async function deleteEntry(selected_date, roomNumber, startTime) {
    try {
        console.log('Deleting entry:', { selected_date, roomNumber, startTime });

        await fetch('/deleteEntry', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ selected_date, roomNumber, startTime }),
        });

        // Clear the grid cells after successful deletion
        clearGridCells();

        alert('Entry deleted successfully!');
    } catch (error) {
        console.error('Error deleting entry:', error);
        throw error;
    }
}

// Function to fetch data by date from the server
async function getDataByDate(date) {
    try {
        const encodedDate = encodeURIComponent(date);
        const response = await fetch(`/fetchDataByDate?date=${encodedDate}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching data by date:', error);
        throw error;
    }
}

