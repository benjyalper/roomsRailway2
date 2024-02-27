$(document).ready(function () {
    let currentRoomNumber;

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

    fetchDataByDate();

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
    const availableEndTimes = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '23:00'];

    // Filter available end times based on the selected start time
    const filteredEndTimes = availableEndTimes.filter(endTime => moment(endTime, 'HH:mm').isAfter(moment(startTime, 'HH:mm')));

    // Append new options to the select element
    filteredEndTimes.forEach(endTime => {
        endTimeSelect.append($('<option>', { value: endTime, text: endTime }));
    });
}


// Function to fetch data by date
async function fetchDataByDate() {

    const lookupDate = $('#lookupDate').val() || moment().format('YYYY-MM-DD');
    $('#lookupDate').val($('#lookupDate').val() || moment().format('YYYY-MM-DD'));
    // console.log(lookupDate)
    try {

        const encodedDate = encodeURIComponent(lookupDate);
        const response = await fetch(`/fetchDataByDate?date=${encodedDate}`);
        const results = await response.json();


        // Clear the grid cells before updating
        $('.grid-cell').css({
            'background-color': 'white',
            'border': '1px solid black',  // Reset the border
        });

        $('.frame').css({
            'background-color': 'rgb(235, 237, 236)'
        });

        if (results.length > 0) {
            // Iterate through the results and update the grid cells
            results.forEach(result => {
                const cell = $(`.grid-cell[data-room-hour="${result.roomNumber} ${result.startTime}"]`);
                const nextCell = $(`.grid-cell[data-room-hour="${result.roomNumber} ${result.endTime}"]`);

                // Get all cells with the same room number between cell and nextCell
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
                    title: 'מטפל/ת: ' + result.names + ' ' + 'חדר: ' + result.roomNumber + '<br>' + 'לחצ/י להסרה', // Tooltip content
                    placement: 'top', // Set tooltip placement
                    html: true
                });

                cellsToColor.on('click', function () {
                    const deleteConfirmation = confirm('האם להסיר פגישה זו?');

                    if (deleteConfirmation) {
                        // Implement your delete logic here
                        deleteEntry(result.roomNumber, result.startTime);
                        fetchDataByDate()
                    } else {
                        console.log("No changes made to schedule");
                    }

                    async function deleteEntry(roomNumber, startTime) {
                        try {
                            const response = await fetch(`/deleteEntry?roomNumber=${roomNumber}&startTime=${startTime}`, {
                                method: 'DELETE',
                            });

                        } catch (error) {
                            console.error(error);
                            throw error;
                        }
                    }
                });
            });


        } else {
            // Reset the color square's background color
            $('#lookupResult').text(`No data found for ${lookupDate}.`);
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}
// Function to fetch data by date
async function dateData() {
    const nowMoment = moment().format('YYYY-MM-DD');

    try {
        const encodedDate = encodeURIComponent(nowMoment);
        const response = await fetch(`/dateData?date=${encodedDate}`);
        const results = await response.json();
        console.log(nowMoment.names)

        if (results.length > 0) {

        } else {
            // Reset the color square's background color
            $('#nowMoment').text(`No data found for ${nowMoment}.`);
        }
    } catch (error) {
        console.error(error);
        throw error;
    }
}


// Function to check if the current time is within a specified range
// function isCurrentTimeInRange(startTime, endTime) {
//     const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' });
//     const nowDateTime = new Date(now);

//     const [startHours, startMinutes, startSeconds] = startTime.split(':').map(Number);
//     const startDateTime = new Date(nowDateTime.getFullYear(), nowDateTime.getMonth(), nowDateTime.getDate(), startHours, startMinutes, startSeconds);

//     const [endHours, endMinutes, endSeconds] = endTime.split(':').map(Number);
//     const endDateTime = new Date(nowDateTime.getFullYear(), nowDateTime.getMonth(), nowDateTime.getDate(), endHours, endMinutes, endSeconds);

//     console.log(startDateTime, endDateTime)
//     return nowDateTime >= startDateTime && nowDateTime <= endDateTime;
// }


// Other functions and code in your script.js file
// $(document).ready(function () {
//     $('#lookupDate').val(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' }).slice(0, 10));
// });

// Function to delete colored cells and corresponding row from the database
async function deleteColoredCells(roomNumber, startTime, endTime) {
    try {
        // Make a server-side request to delete the corresponding row from the database
        const response = await fetch('/deleteRow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roomNumber, startTime, endTime }),
        });

        const result = await response.json();

        if (result.success) {
            // Remove the colored cells from the frontend
            const cellsToDelete = $(`.grid-cell[data-room-hour^="${roomNumber} ${startTime}"]`);

            cellsToDelete.each(function () {
                console.log('Deleting cell:', this); // Log each cell being deleted

                $(this).css({
                    'background-color': 'white',
                    'border': '1px solid black',
                });
                $(this).html(''); // Remove content from the cells
                window.location.href = '/room-schedule.html';
            });

            console.log('Cells deleted successfully');
        } else {
            console.error('Error deleting row:', result.error);
        }
    } catch (error) {
        console.error('Error deleting row:', error);
    }
}

// Function to show the delete tooltip
// Function to show the delete tooltip
function showDeleteTooltip(roomNumber, startTime, endTime) {
    const tooltipContent = `
        <div class="delete-tooltip">
            <p>Delete</p>
        </div>
    `;

    const cell = $(`.grid-cell[data-room-hour="${roomNumber} ${startTime}"]`);
    const tooltip = $(tooltipContent);

    // Position the tooltip
    const cellOffset = cell.offset();
    const tooltipTop = cellOffset.top + cell.height() / 2 - tooltip.height() / 2;
    const tooltipLeft = cellOffset.left + cell.width() / 2 - tooltip.width() / 2;

    tooltip.css({ top: tooltipTop, left: tooltipLeft });

    // Append the tooltip to the body
    $('body').append(tooltip);

    // Attach click event to delete button
    tooltip.find('p').on('click', async function () {
        await deleteColoredCells(roomNumber, startTime, endTime);
        tooltip.remove(); // Remove the tooltip after deletion
    });
}

// Attach click event to delete button using event delegation
$('body').on('click', '.delete-tooltip p', async function () {
    await deleteColoredCells(roomNumber, startTime, endTime);
    $('.delete-tooltip').remove(); // Remove the tooltip after deletion
});


// Function to hide the delete tooltip
function hideDeleteTooltip() {
    $('.delete-tooltip').remove();
}

// Function to delete cells and corresponding row
async function deleteCellsAndRow(roomNumber, startTime, endTime) {
    // Perform deletion logic here, e.g., make a server-side request to delete the data

    try {
        const response = await fetch('/deleteCellsAndRow', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ roomNumber, startTime, endTime }),
        });

        const result = await response.text();
        console.log(result); // Log the result of the deletion
    } catch (error) {
        console.error('Error deleting cells and row:', error);
    }
}

