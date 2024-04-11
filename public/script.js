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

    // $('.room-schedule-link').click(function () {
    //     window.location.href = '/newRoomSchedule.html';
    // });

    $('.drop-down-to-room-form-link').click(function () {
        window.location.href = '/room-form.html';
    });

    $('.cat-link').click(function () {
        window.location.href = '/messages.html';
    });

    $('.cat').on('click', function () {
        alert("חתלתוללללל....!");
    });

    fetchDataByDate()
    $('#lookupDate').val(moment().format('YYYY-MM-DD'));

    // Update end time options when start time changes
    $('#startTime').on('change', function () {
        updateEndTimeOptions();
    });

    $('#recurringEvent').change(function () {
        const recurringNoLabel = $('label[for="recurringNum"]');
        // Check if the checkbox is checked
        if ($(this).is(':checked')) {
            // If checked, make the specified elements visible
            $('#recurringNum').css('visibility', 'visible');
            $(recurringNoLabel).css('visibility', 'visible');
        } else {
            // If not checked, hide the specified elements
            $('#recurringNum').css('visibility', 'hidden');
            $(recurringNoLabel).css('visibility', 'hidden');
        }
    });

    // Handle form submission
    $('form').submit(function (event) {
        event.preventDefault(); // Prevent the default form submission
        submitMessage(); // Call the submitMessage function
    });

    // Call the function to display the last 10 messages when the page is loaded
    displayLast10Messages();

    // buildGrid();

    fetchDataByDate();

});

async function buildGrid() {
    const numberOfRows = 20;
    const numberOfColumns = 15;

    $('.grid-container').css('--num-columns', numberOfColumns);
    $('.grid-container').css('--num-rows', numberOfRows);

    let num = 0;
    let roomNum = 1;
    let hour = 7;
    let halfy = numberOfColumns * 3;
    let columnNumber = 0;
    let togler = true;

    function toggleFunc() {
        togler = !togler;
    }

    for (let i = 0; i < numberOfRows * numberOfColumns * 2; i++) {
        const currentCellClass = togler ? 'wholeHour' : 'halfHour';
        const formattedHour = hour < 10 ? `0${hour}` : `${hour}`;
        const roomHour = `${columnNumber} ${formattedHour}:00:00`;
        const halfHourRoomHour = `${columnNumber} ${formattedHour - 1}:30:00`;

        // Append the grid cell with data-room-hour attribute
        const cellHtml = `<div class="grid-cell grid-cell${num}" data-room-hour="${currentCellClass === 'wholeHour' ? roomHour : halfHourRoomHour}"></div>`;
        $('.grid-container').append(cellHtml);

        console.log(`Loop iteration: ${i}, num: ${num}, hour: ${hour}, columnNumber: ${columnNumber}, togler: ${togler}, currentCellClass: ${currentCellClass}`);

        if (i % numberOfColumns === 0) {
            toggleFunc();
            console.log(`Toggler changed: ${togler}`);
        }

        $(`.grid-cell${num}`).addClass(currentCellClass);

        if (columnNumber < numberOfColumns) {
            columnNumber++;
        } else {
            columnNumber = 1;
        }

        if (num < numberOfColumns || num % numberOfColumns === 0) {
            $(`.grid-cell${num}`).addClass('frame');
            $(`.grid-cell${num}`).css('background-color', 'rgb(235, 237, 236)');
        }

        if (num < numberOfColumns) {
            $(`.grid-cell${num}`).addClass('room');
            $(`.grid-cell${num}`).html(`חדר ${roomNum}`);
            roomNum++;
        }

        if (num === 0) {
            $(`.grid-cell${num}`).html(null);
        } else if (num === halfy) {
            $(`.grid-cell${num - numberOfColumns}`).html(`${hour - 1}:30`);
            halfy += numberOfColumns * 2;
        } else if (num % numberOfColumns === 0) {
            $(`.grid-cell${num - numberOfColumns}`).html(`${hour}:00`);
            hour++;
        }

        num++;
    }
}

// Function to submit date
async function submitDate() {
    const selectedDate = $('#selectedDate').val();
    const names = $('#names').val();
    const selectedColor = $('#selectedColor').val();
    const startTime = $('#startTime').val();
    const endTime = $('#endTime').val();
    const roomNumber = $('#roomNumber').val();
    const recurringEvent = $('#recurringEvent').is(':checked');
    const recurringNum = $('#recurringNum').val();

    // Check if names is equal to "פנוי"
    if (names === "פנוי") {
        // Construct the message to be submitted
        const messageInput = `חדר ${roomNumber} פנוי בתאריך ${selectedDate} בשעות ${startTime} - ${endTime}`;

        // Submit the message
        await submitMessageWithMessage(messageInput);
    }

    // Submit the date as usual
    const response = await fetch('/submit', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent, recurringNum }),
    });

    const result = await response.text();
    $('#message').text(result);

    // Log the submitted data to the console
    console.log(`Submitted Date: ${selectedDate}, Names: ${names}, Color: ${selectedColor}, Start Time: ${startTime}, End Time: ${endTime}, Room Number: ${roomNumber}, Recurring Event: ${recurringEvent}, recurringNum: ${recurringNum}`);

    // Update end time options based on the selected start time
    updateEndTimeOptions();
}

async function submitMessageWithMessage(messageInput) {
    // Check if the message is not empty
    if (messageInput.trim() === "") {
        alert("הודעה לא יכולה להיות ריקה");
        return;
    }

    const response = await fetch('/submit_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: messageInput }),
    });

    // Handle the response if needed
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

    if (result.names === "פנוי") {
        const middleContent = '<div class="therapist-name" style="font-size: 16px; color: black;">' + result.names + '</div>';
        middleCell.html(middleContent);
    } else {
        const middleContent = '<div class="therapist-name">' + result.names + '</div>';
        middleCell.html(middleContent);
    }

    // Add content to the cell

    cellsToColor.tooltip({
        title: 'מטפל/ת: ' + result.names + ' ' + 'חדר: ' + result.roomNumber + '<br>' + 'לחצ/י להסרה',
        placement: 'top',
        html: true
    });

    cellsToColor.off('click').on('click', async function handleClick() {
        const selectedDate = $('#lookupDate').val(); // Use the selected date from the UI

        const deleteConfirmation = confirm('האם להסיר פגישה זו?');

        // Call checkRecurringEvent function with relevant parameters
        const checkResult = await checkRecurringEvent(selectedDate, result.roomNumber, result.startTime, result.recurringNum);

        // Assuming that checkResult is an object containing information about the recurring event
        if (checkResult.isRecurring) {
            const recurringDeleteConfirmation = await Swal.fire({
                title: 'זהו אירוע חוזר',
                showDenyButton: true,
                confirmButtonText: 'מחק את כל האירועים',
                denyButtonText: 'מחק אירוע זה בלבד',
                showCancelButton: true,
                cancelButtonText: 'בטל',
            });

            if (recurringDeleteConfirmation.isDismissed) {
                // User clicked "Cancel" or closed the modal without choosing a specific option
                console.log("No changes made to schedule");
            } else {
                // User clicked on one of the custom buttons
                const confirmedOption = recurringDeleteConfirmation.isConfirmed ? 'deleteAll' : 'deleteThis';
                if (confirmedOption === 'deleteAll') {
                    // Delete all instances of the recurring event
                    for (let i = 0; i <= checkResult.recurringNum; i++) {
                        const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                        await deleteEntry(nextDate, result.roomNumber, result.startTime);
                    }
                    alert('האירועים שנבחרו הוסרו בהצלחה!');
                } else if (confirmedOption === 'deleteThis') {
                    // Delete only this instance of the recurring event
                    await deleteEntry(selectedDate, result.roomNumber, result.startTime);
                    alert('האירוע שנבחר הוסר בהצלחה!');
                } else {
                    console.log("No changes made to schedule");
                }
            }
        } else if (deleteConfirmation) {
            // Perform the deletion only if it's a single event
            await deleteEntry(selectedDate, result.roomNumber, result.startTime);
            alert('האירועים שנבחרו הוסרו בהצלחה!');
        }

        // Unbind the click event to avoid multiple executions
        cellsToColor.off('click', handleClick);
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

        fetchDataByDate()

    } catch (error) {
        console.error('Error deleting entry:', error);
        throw error;
    }
}

async function checkRecurringEvent(selected_date, roomNumber, startTime, recurringNum) {
    try {
        console.log('Checking recurring event:', { selected_date, roomNumber, startTime, recurringNum });

        const response = await fetch('/checkRecurringEvent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ selected_date, roomNumber, startTime, recurringNum }),
        });

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        const result = await response.json();

        // Log the result to the console for debugging
        console.log('checkRecurringEvent result:', result, recurringNum);

        // Add an alert with recurringNum
        // alert(`Recurring Number: ${result.recurringNum}`);


        return result;
    } catch (error) {
        console.error('Error checking recurring event:', error.message);
        // Handle the error, e.g., show an alert to the user
        return { isRecurring: false, isNonRecurring: false }; // Assuming a default value in case of an error
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


//mesages section

async function displayLast10Messages() {
    try {
        const response = await fetch('/get_last_messages');

        if (!response.ok) {
            throw new Error(`Server responded with status ${response.status}`);
        }

        const { messages, messageIds } = await response.json();

        // Check if 'messages' and 'messageIds' are arrays
        if (!Array.isArray(messages) || !Array.isArray(messageIds) || messages.length !== messageIds.length) {
            throw new Error('Invalid response format: messages or messageIds is not a valid array');
        }

        // Assuming messages is an array of message strings
        const toDoItems = $(".to-do-items");

        // Clear existing messages
        toDoItems.empty();

        $('.to-do-items').on('click', '.fa-trash', async function () {
            const divParent = $(this).closest('.item');
            const index = divParent.attr('data-index');

            // Confirm deletion with the user
            const confirmation = confirm('האם למחוק את ההודעה?');

            if (confirmation) {
                const messageId = messageIds[index];

                // Remove the message from the database
                console.log('Deleting message with ID:', messageId);
                const response = await fetch('/delete_message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ messageId: messageId.toString() }),
                });

                if (response.ok) {
                    // Remove the message from the UI
                    divParent.addClass('animate__slideOutLeft');
                    setTimeout(function () {
                        location.reload();
                    }, 1200);
                } else {
                    alert('שגיאה במחיקת ההודעה');
                }
            }
        });

        // Display the last 10 messages
        messages.forEach((message, index) => {
            const divParent = $("<div>").addClass("item").addClass("animate__animated").html('<div>' + message + '</div>');
            const checkIcon = $("<i>").addClass("fas fa-check-square").css("color", "lightgray").on("click", function () {
                $(this).css("color", "limegreen");
            });

            const trashIcon = $("<i>").addClass("fas fa-trash").css("color", "darkgrey")

            const divChild = $("<div>").append(checkIcon, trashIcon);
            divParent.append(divChild);

            // Set data-index attribute with the index
            divParent.attr('data-index', index);

            toDoItems.append(divParent);
        });

    } catch (error) {
        console.error('Error fetching or displaying messages:', error);
        alert('Error fetching or displaying messages');
    }
}




async function submitMessage() {
    const messageInput = $("#input").val();

    // Check if the message is not empty
    if (messageInput.trim() === "") {
        alert("הודעה לא יכולה להיות ריקה");
        return;
    }

    const response = await fetch('/submit_message', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: messageInput }),
    });

    const result = await response.json(); // Parse the response JSON

    // Display the submitted message
    const toDoItems = $(".to-do-items");
    const divParent = $("<div>").addClass("item").addClass("animate__animated animate__bounce").html('<div>' + messageInput + '</div>');
    const checkIcon = $("<i>").addClass("fas fa-check-square").css("color", "lightgray").on("click", function () {
        $(this).css("color", "limegreen")
    });


    const trashIcon = $("<i>").addClass("fas fa-trash").css("color", "darkgrey").on("click", function () {
        const messageId = result.messageId; // Get the messageId from the result
        divParent.attr('data-id', messageId); // Set the data-id attribute
        deleteMessage(messageId, divParent);
    });

    const divChild = $("<div>").append(checkIcon, trashIcon);
    divParent.append(divChild);

    // Prepend the new message at the top
    toDoItems.prepend(divParent);

    // Clear the input field
    $("#input").val('');
}


// Function to delete a message
async function deleteMessage(messageId, divParent) {
    try {
        console.log('Deleting message with ID:', messageId);

        // Check if messageId is available
        if (messageId) {
            const response = await fetch('/delete_message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ messageId: parseInt(messageId, 10) }), // Convert to integer
            });

            if (response.ok) {
                // Remove the message from the UI if it exists
                const divParent = $(".to-do-items").find(`[data-id="${messageId}"]`);
                if (divParent.length > 0) {
                    divParent.addClass('animate__slideOutLeft');
                    setTimeout(function () {
                        location.reload();
                    }, 1200);
                }
            } else {
                // Log the error details
                console.error('Error deleting the message:', response.status, response.statusText);
                alert('Error deleting the message');
            }
        } else {
            console.error('Invalid messageId:', messageId);
            alert('Error deleting the message');
        }
    } catch (error) {
        console.error('Unexpected error during message deletion:', error);
        alert('Unexpected error during message deletion');
    }
}

