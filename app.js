import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import mysql from 'mysql2/promise';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment-timezone';
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
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
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
    req.logout(err => err ? res.status(500).send('Logout failed') : res.redirect('/index.html'));
});

app.get('/fetchDataByDate', isAuthenticated, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const date = req.query.date || moment().tz('Asia/Jerusalem').format('YYYY-MM-DD');
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(
            `SELECT selected_date, names, color, startTime, endTime, roomNumber FROM selected_dates_2_${clinic} WHERE selected_date = ?`,
            [date]
        );
        conn.release();
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/submit', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selectedDate, names, selectedColor, startTime, endTime, roomNumber, recurringEvent, recurringNum } = req.body;
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        if (recurringEvent) {
            const times = parseInt(recurringNum, 10);
            for (let i = 0; i < times; i++) {
                const next = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                await conn.execute(
                    `INSERT INTO selected_dates_2_${clinic} (selected_date,names,color,startTime,endTime,roomNumber,recurringEvent,recurringNum)
           VALUES (?,?,?,?,?,?,?,?)`,
                    [next, names, selectedColor, startTime, endTime, roomNumber, true, times]
                );
            }
        } else {
            await conn.execute(
                `INSERT INTO selected_dates_2_${clinic} (selected_date,names,color,startTime,endTime,roomNumber,recurringEvent)
         VALUES (?,?,?,?,?,?,?)`,
                [selectedDate, names, selectedColor, startTime, endTime, roomNumber, false]
            );
        }
        await conn.commit();
        conn.release();
        res.send('סידור חדרים עודכן בהצלחה.');
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

app.delete('/deleteEntry', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selected_date, roomNumber, startTime } = req.body;
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        await conn.execute(
            `DELETE FROM selected_dates_2_${clinic} WHERE selected_date = ? AND roomNumber = ? AND startTime = ?`,
            [selected_date, roomNumber, startTime]
        );
        conn.release();
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

app.get('/room/:roomNumber', isAuthenticated, async (req, res) => {
    try {
        const roomNumber = req.params.roomNumber;
        const clinic = req.user.clinic;
        const today = moment().tz('Asia/Jerusalem').format('YYYY-MM-DD');
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(
            `SELECT * FROM selected_dates_2_${clinic} WHERE selected_date = ? AND roomNumber = ?`,
            [today, roomNumber]
        );
        conn.release();
        const now = moment().tz('Asia/Jerusalem');
        let currentTherapist = null;
        for (const r of rows) {
            const s = moment(r.startTime, 'HH:mm:ss');
            const e = moment(r.endTime, 'HH:mm:ss');
            if (now.isBetween(s, e)) {
                currentTherapist = { name: r.names, endTime: e.format('HH:mm') };
                break;
            }
        }
        res.render('room', { roomNumber, currentTherapist, data: rows });
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

app.get('/get_last_messages', isAuthenticated, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const [rows] = await pool.query(`SELECT * FROM messages_${clinic} ORDER BY id DESC LIMIT 10`);
        res.json({ messages: rows.map(r => r.message), messageIds: rows.map(r => r.id) });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/submit_message', isAuthenticated, async (req, res) => {
    try {
        const message = req.body.input;
        if (!message) return res.status(400).json({ error: 'Empty' });
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        const [r] = await conn.execute(`INSERT INTO messages_${clinic} (message) VALUES (?)`, [message]);
        conn.release();
        res.json({ messageId: r.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/delete_message', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { messageId } = req.body;
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        await conn.execute(`DELETE FROM messages_${clinic} WHERE id=?`, [parseInt(messageId, 10)]);
        conn.release();
        res.send('Deleted');
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

app.get('/favicon.ico', (req, res) => res.status(204));
app.listen(port, '0.0.0.0', () => console.log(`Server listening on port ${port}`));
