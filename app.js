// Import necessary modules
import express from 'express';
// import session from 'express-session';
import bodyParser from 'body-parser';
import mysql from 'mysql2/promise'; // Use the promise version of mysql2
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import dotenv from 'dotenv';
import fs from 'fs/promises'; // Import the 'fs' module for file operations
dotenv.config();

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import session from 'express-session';
import flash from 'express-flash';


const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

const users = [
    { id: 1, username: 'admin', password: 'admin', role: 'admin', clinic: 'clalit' },
    { id: 2, username: 'admin1', password: 'admin1', role: 'admin', clinic: 'marbah' },
    { id: 3, username: 'user2', password: 'user2', role: 'user', clinic: 'green' }
];

passport.use(new LocalStrategy((username, password, done) => {
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return done(null, false, { message: 'Incorrect username or password.' });
    }
    return done(null, user);
}));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user);
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/home.html');
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Permission denied.');
}


const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    secret: process.env.SESSION_SECRET,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// app.use(session({ secret: 'your-secret-key', resave: true, saveUninitialized: true }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());



// Set EJS as the view engine
app.set('view engine', 'ejs');

app.use(express.static('public'));

app.get('/signin', (req, res) => {
    res.redirect('/index.html');
});

app.get('/admin', isAuthenticated, isAdmin, (req, res) => {
    res.send('Admin Page');
});

app.post('/signin',
    passport.authenticate('local', { successRedirect: '/home.html', failureRedirect: '/signin', failureFlash: true })
);

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.redirect('/index.html'); // Redirect to your login page
    });
});



// Express route to submit date, names, and color
app.post('/submit', async (req, res) => {
    try {

        // Retrieve user's clinic
        const user = req.user;
        const userClinic = user ? user.clinic : 'default'; // Use 'default' as a fallback

        if (!req.user || req.user.role !== 'admin') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            return res.status(403).send('למשתמש זה אין הרשאה לעריכה, יש לפנות למנהל.');
        }

        const selectedDate = req.body.selectedDate;
        const names = req.body.names;
        const selectedColor = req.body.selectedColor;
        const startTime = req.body.startTime;
        const endTime = req.body.endTime;
        const roomNumber = req.body.roomNumber;
        const recurringEvent = req.body.recurringEvent || false;
        const recurringNum = req.body.recurringNum;

        // Validate inputs (if needed)

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {

            if (recurringEvent) {
                // Insert the recurring events for the next 4 weeks (adjust as needed)
                for (let i = 0; i < `${recurringNum}`; i++) {
                    const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                    await connection.execute(`INSERT INTO selected_dates_2_${userClinic} (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent, recurringNum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [nextDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent, recurringNum]);
                }
            } else {
                // Insert the main event
                await connection.execute(`INSERT INTO selected_dates_2_${userClinic} (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent) VALUES (?, ?, ?, ?, ?, ?, ?)`, [selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent]);

            }

            await connection.commit();
            res.status(200).send('סידור חדרים עודכן בהצלחה.');
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});


app.delete('/deleteEntry', async (req, res) => {
    const { selected_date, roomNumber, startTime } = req.body;

    console.log('Received request to delete entry:', { selected_date, roomNumber, startTime });

    if (!selected_date || !roomNumber || !startTime) {
        return res.status(400).send('Bad Request: Missing parameters.');
    }

    try {
        // Retrieve user's clinic
        const user = req.user;
        const userClinic = user ? user.clinic : 'default'; // Use 'default' as a fallback
        const connection = await pool.getConnection();

        // Directly delete the row with the specified parameters using parameterized query
        const query = `DELETE FROM selected_dates_2_${userClinic} WHERE selected_date = ? AND roomNumber = ? AND startTime = ?`;
        const [result] = await connection.execute(query, [selected_date, roomNumber, startTime]);

        console.log('Deletion result:', result);

        connection.release();

        return res.sendStatus(200);

    } catch (error) {
        console.error('Error deleting entry from the database:', error);
        return res.status(500).send(`Internal Server Error: ${error.message}`);
    }
});


app.post('/checkRecurringEvent', async (req, res) => {
    try {
        const { selected_date, roomNumber, startTime, recurringNum } = req.body;

        if (!selected_date || !roomNumber || !startTime) {
            return res.status(400).send('Bad Request: Missing parameters.');
        }

        const connection = await pool.getConnection();

        // Log recurringNum
        console.log('Received parameters:', { selected_date, roomNumber, startTime, recurringNum });

        // Check if there is any recurring event for the given parameters
        const recurringQuery = `SELECT * FROM selected_dates_2_${userClinic} WHERE selected_date = ? AND roomNumber = ? AND startTime = ? AND recurringEvent = true`;
        const [recurringResult] = await connection.execute(recurringQuery, [selected_date, roomNumber, startTime]);

        // Check if there is any non-recurring event for the given parameters
        const nonRecurringQuery = `SELECT * FROM selected_dates_2_${userClinic} WHERE selected_date = ? AND roomNumber = ? AND startTime = ? AND recurringEvent = false`;
        const [nonRecurringResult] = await connection.execute(nonRecurringQuery, [selected_date, roomNumber, startTime]);

        connection.release();

        console.log('Recurring event query result:', recurringResult);
        console.log('Non-recurring event query result:', nonRecurringResult);

        const resultToSend = {
            isRecurring: recurringResult.length > 0,
            isNonRecurring: nonRecurringResult.length > 0,
            recurringNum: recurringResult.length > 0 ? recurringResult[0].recurringNum : undefined,
        };

        res.json(resultToSend);
        console.log(resultToSend.recurringNum)

    } catch (error) {
        console.error('Error checking recurring event:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});




app.get('/room/:roomNumber', async (req, res) => {
    const roomNumber = req.params.roomNumber;

    try {
        // Retrieve room schedule data from MySQL database
        const connection = await pool.getConnection();
        const [roomRows] = await connection.execute(`SELECT * FROM selected_dates_2_${userClinic} WHERE roomNumber = ?`, [roomNumber]);

        // Fetch data for today
        const nowMoment = moment().format('YYYY-MM-DD');
        const [dateRows] = await connection.execute(`SELECT names, color, startTime, endTime, roomNumber FROM selected_dates_2_${userClinic} WHERE selected_date = ?`, [nowMoment]);

        connection.release();

        // Render the room EJS template with the room schedule and date data
        res.render('room', { roomNumber, therapist_name: roomRows, data: dateRows });
        console.log('Fetched Data:', roomRows, dateRows);
    } catch (error) {
        console.error('Error retrieving data from the database:', error);
        return res.status(500).send('Internal Server Error');
    }
});



// Express route to fetch all data for a specific date
app.get('/fetchDataByDate', async (req, res) => {
    try {
        const lookupDate = req.query.date || moment().format('YYYY-MM-DD');

        const connection = await pool.getConnection();
        const [rows] = await connection.execute(`SELECT selected_date, names, color, startTime, endTime, roomNumber FROM selected_dates_2_${userClinic} WHERE selected_date = ?`, [lookupDate]);
        connection.release();

        if (rows.length > 0) {
            res.json(rows);
        } else {
            res.status(404).json({ error: 'No data found for the specified date.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});