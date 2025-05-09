// Full corrected app.js for your Express app
import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import mysql from 'mysql2/promise';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import dotenv from 'dotenv';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import flash from 'express-flash';

dotenv.config();
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: false }));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

app.set('view engine', 'ejs');

const users = [
    { id: 1, username: 'marbah', password: 'junior', role: 'admin', clinic: 'marbah' },
    { id: 2, username: 'admin1', password: 'admin1', role: 'admin', clinic: 'clalit' },
    { id: 3, username: 'user', password: 'user', role: 'user', clinic: 'marbah' },
    { id: 4, username: 'user1', password: 'user1', role: 'user', clinic: 'clalit' },
    { id: 5, username: 'user3', password: 'user3', role: 'user', clinic: 'marbah' }
];

passport.use(new LocalStrategy((username, password, done) => {
    const user = users.find(u => u.username === username && u.password === password);
    return user ? done(null, user) : done(null, false, { message: 'Incorrect username or password.' });
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => done(null, users.find(u => u.id === id)));

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    const acceptsJson = req.headers.accept && req.headers.accept.includes('application/json');
    if (acceptsJson) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    res.redirect('/index.html');
}

function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    res.status(403).send('Permission denied.');
}

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.get('/signin', (req, res) => res.redirect('/index.html'));

app.post('/signin', passport.authenticate('local', {
    successRedirect: '/home.html',
    failureRedirect: '/signin',
    failureFlash: true
}));

app.get('/logout', (req, res) => {
    req.logout(err => {
        if (err) return res.status(500).send('Logout failed');
        res.redirect('/index.html');
    });
});

app.get('/fetchDataByDate', isAuthenticated, async (req, res) => {
    try {
        const user = req.user;
        const userClinic = user.clinic;
        const lookupDate = req.query.date || moment().format('YYYY-MM-DD');
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(`SELECT selected_date, names, color, startTime, endTime, roomNumber FROM selected_dates_2_${userClinic} WHERE selected_date = ?`, [lookupDate]);
        connection.release();
        res.json(rows);
    } catch (error) {
        console.error('fetchDataByDate error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/submit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent, recurringNum } = req.body;
        const userClinic = req.user.clinic;
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        if (recurringEvent) {
            if (isNaN(recurringNum) || recurringNum < 1 || recurringNum > 40) {
                return res.status(400).send('מספר החזרות המירבי הוא 40.');
            }
            for (let i = 0; i < recurringNum; i++) {
                const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                await connection.execute(`INSERT INTO selected_dates_2_${userClinic} (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent, recurringNum) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [nextDate, names, selectedColor, startTime, endTime, roomNumber, true, recurringNum]);
            }
        } else {
            await connection.execute(`INSERT INTO selected_dates_2_${userClinic} (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent) VALUES (?, ?, ?, ?, ?, ?, ?)`, [selectedDate, names, selectedColor, startTime, endTime, roomNumber, false]);
        }

        await connection.commit();
        connection.release();
        res.status(200).send('סידור חדרים עודכן בהצלחה.');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.delete('/deleteEntry', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selected_date, roomNumber, startTime } = req.body;
        const userClinic = req.user.clinic;
        const connection = await pool.getConnection();
        await connection.execute(`DELETE FROM selected_dates_2_${userClinic} WHERE selected_date = ? AND roomNumber = ? AND startTime = ?`, [selected_date, roomNumber, startTime]);
        connection.release();
        res.sendStatus(200);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/get_last_messages', isAuthenticated, async (req, res) => {
    try {
        const userClinic = req.user.clinic;
        const [rows] = await pool.query(`SELECT * FROM messages_${userClinic} ORDER BY id DESC LIMIT 10`);
        const messages = rows.map(row => row.message);
        const messageIds = rows.map(row => row.id);
        res.status(200).json({ messages, messageIds });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/submit_message', isAuthenticated, async (req, res) => {
    try {
        const message = req.body.input;
        if (!message || message.trim() === '') {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }
        const userClinic = req.user.clinic;
        const connection = await pool.getConnection();
        const [result] = await connection.execute(`INSERT INTO messages_${userClinic} (message) VALUES (?)`, [message]);
        connection.release();
        res.status(200).json({ messageId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/delete_message', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const messageId = req.body.messageId;
        const userClinic = req.user.clinic;
        const connection = await pool.getConnection();
        await connection.execute(`DELETE FROM messages_${userClinic} WHERE id = ?`, [parseInt(messageId)]);
        connection.release();
        res.status(200).send('Message deleted successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/favicon.ico', (req, res) => res.status(204));

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${port}`);
});
