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
    { id: 1, username: 'benjyalper', password: 'Ag1ag1ag1$', role: 'admin' },
    { id: 2, username: 'adar', password: 'parrot', role: 'user' },
    { id: 3, username: 'yahav', password: 'pizi', role: 'user' }
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

        // Validate inputs (if needed)

        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Insert the main event
            await connection.execute('INSERT INTO selected_dates_2 (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent) VALUES (?, ?, ?, ?, ?, ?, ?)', [selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent]);

            if (recurringEvent) {
                // Insert the recurring events for the next 4 weeks (adjust as needed)
                for (let i = 1; i <= 4; i++) {
                    const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                    await connection.execute('INSERT INTO selected_dates_2 (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent) VALUES (?, ?, ?, ?, ?, ?, ?)', [nextDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent]);
                }
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
        const connection = await pool.getConnection();

        // Directly delete the row with the specified parameters using parameterized query
        const query = 'DELETE FROM selected_dates_2 WHERE selected_date = ? AND roomNumber = ? AND startTime = ?';
        const [result] = await connection.execute(query, [selected_date, roomNumber, startTime]);

        console.log('Deletion result:', result);

        connection.release();

        return res.sendStatus(200);

    } catch (error) {
        console.error('Error deleting entry from the database:', error);
        return res.status(500).send(`Internal Server Error: ${error.message}`);
    }
});



app.get('/room/:roomNumber', async (req, res) => {
    const roomNumber = req.params.roomNumber;

    try {
        // Retrieve room schedule data from MySQL database
        const connection = await pool.getConnection();
        const [roomRows] = await connection.execute('SELECT * FROM selected_dates_2 WHERE roomNumber = ?', [roomNumber]);

        // Fetch data for today
        const nowMoment = moment().format('YYYY-MM-DD');
        const [dateRows] = await connection.execute('SELECT names, color, startTime, endTime, roomNumber FROM selected_dates_2 WHERE selected_date = ?', [nowMoment]);

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
        const [rows] = await connection.execute('SELECT names, color, startTime, endTime, roomNumber FROM selected_dates_2 WHERE selected_date = ?', [lookupDate]);
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

// Express route to fetch all data for today
app.get('/dateData', async (req, res) => {
    try {
        const nowMoment = moment().format('YYYY-MM-DD');

        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT names, color, startTime, endTime, roomNumber FROM selected_dates_2 WHERE selected_date = ?', [nowMoment]);
        connection.release();

        if (rows.length > 0) {
            // res.json(rows);
            // Render the room EJS template with the room schedule data
            res.render('dateData', { data: rows, roomNumber: '2' });
            console.log('Fetched Data:', nowMoment);
        } else {
            res.status(404).json({ error: 'No data found for the specified date.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


app.post('/therapist-form', async (req, res) => {
    try {
        const formData = req.body;
        const { therapistName, roomNumber, startTime, endTime, selectedDate } = formData;


        const connection = await pool.getConnection();
        try {
            await connection.execute(
                'INSERT INTO selected_dates_2 ( roomNumber, startTime, endTime) VALUES (?, ?, ?)',
                [roomNumber, startTime, endTime]
            );
        } finally {
            connection.release();
        }

        console.log('Data inserted into the database:', formData);
        res.status(200).send('Data inserted into the database successfully');
    } catch (error) {
        console.error('Error handling therapist-form data:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Express route to delete a row
app.post('/deleteRow', async (req, res) => {
    try {
        const { roomNumber, startTime, endTime } = req.body;
        console.log({ roomNumber, startTime, endTime })

        const connection = await pool.getConnection();
        try {
            // Delete the row from the database
            await connection.execute('DELETE FROM selected_dates_2 WHERE roomNumber = ? AND startTime = ? AND endTime = ?', [roomNumber, startTime, endTime]);
            res.json({ success: true });
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error deleting row from the database:', error);
        res.json({ success: false, error: 'Internal Server Error' });
    }
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});