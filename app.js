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
import 'moment/locale/he.js';
moment.locale('he');
import { sendWhatsApp } from './utils/whatsapp.js'; // Import the WhatsApp function
import { sendMail } from './utils/mail.js';
import { sendSMS } from './utils/sms.js';
import { clinicEmailRecipients, clinicSmsRecipients } from './config/clinic-recipients.js';



dotenv.config();
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

// ─── STATIC FILES (except index.html) ───────────────────────────────────────
app.use(express.static('public', { index: false }));

// ─── BODY & SESSION MIDDLEWARE ──────────────────────────────────────────────
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

// ─── VIEW ENGINE ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', './views');

// ─── IN-MEMORY USERS (PHONE-ONLY) ────────────────────────────────────────────
const users = [
    { id: 1, phone: '0509916633', role: 'admin', clinic: 'marbah' },
    { id: 2, phone: '0506431842', role: 'admin', clinic: 'marbah' },
    { id: 3, phone: '0546634482', role: 'admin', clinic: 'marbah' },
    { id: 4, phone: '0524393500', role: 'admin', clinic: 'marbah' },
    { id: 5, phone: '0545298212', role: 'admin', clinic: 'marbah' },
    { id: 6, phone: '0504225525', role: 'admin', clinic: 'marbah' },
    { id: 7, phone: '0528204818', role: 'admin', clinic: 'marbah' },
    { id: 8, phone: '0508443534', role: 'admin', clinic: 'marbah' },
    { id: 9, phone: '0524710303', role: 'admin', clinic: 'marbah' },
    { id: 10, phone: '0544984022', role: 'admin', clinic: 'marbah' },
    { id: 11, phone: '0544962370', role: 'admin', clinic: 'marbah' },
    { id: 12, phone: '0509014492', role: 'admin', clinic: 'marbah' },
    { id: 13, phone: '0524543471', role: 'admin', clinic: 'marbah' },
    { id: 14, phone: '0546718945', role: 'admin', clinic: 'marbah' },
    { id: 15, phone: '0507517336', role: 'admin', clinic: 'marbah' },
    { id: 16, phone: '0528204818', role: 'admin', clinic: 'marbah' },
    { id: 17, phone: '0522261073', role: 'admin', clinic: 'marbah' },

    { id: 5, phone: '0504444444', role: 'user', clinic: 'clalit' },
    { id: 6, phone: '0505555522', role: 'user', clinic: 'marbah' },
    { id: 7, phone: '0524393500', role: 'admin', clinic: 'marbah' },
    { id: 8, phone: '0546718945', role: 'admin', clinic: 'marbah' },
    { id: 9, phone: '0524543471', role: 'admin', clinic: 'marbah' },
    //demo users
    { id: 10, phone: '0505555555', role: 'admin', clinic: 'demo1' },
    { id: 11, phone: '0502476078', role: 'admin', clinic: 'demo1' },
    { id: 11, phone: '0547515021', role: 'admin', clinic: 'demo1' },
];

// ─── PASSPORT LOCAL STRATEGY (PHONE ONLY) ───────────────────────────────────
passport.use(new LocalStrategy(
    { usernameField: 'phone', passwordField: 'phone' },
    (phone, _, done) => {
        const user = users.find(u => u.phone === phone);
        return user
            ? done(null, user)
            : done(null, false, { message: 'מספר טלפון לא נמצא' });
    }
));
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
    const user = users.find(u => u.id === id);
    done(null, user ?? false);
});

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────────────
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/signin');
}
function isAdmin(req, res, next) {
    if (req.isAuthenticated() && req.user.role === 'admin') return next();
    res.status(403).send('Permission denied.');
}

// ─── DATABASE POOL ───────────────────────────────────────────────────────────
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

// ─── AUTH ROUTES ──────────────────────────────────────────────────────────────
// Redirect root to /signin
app.get('/', (req, res) => res.redirect('/signin'));

// Sign-in form
app.get('/signin', (req, res) => {
    res.render('index', { title: 'התחברות' });
});
app.post('/signin',
    passport.authenticate('local', {
        successRedirect: '/home',
        failureRedirect: '/signin',
        failureFlash: true
    })
);

// Logout
app.get('/logout', (req, res) => {
    req.logout(err =>
        err
            ? res.status(500).send('Logout failed')
            : res.redirect('/signin')
    );
});

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────
app.get('/home', isAuthenticated, (req, res) => {
    res.render('home', { title: 'סידור חדרים' });
});

app.get('/room-schedule', isAuthenticated, (req, res) =>
    res.render('room-schedule', { title: 'טבלת חדרים' })
);
app.get('/room-form', isAuthenticated, (req, res) =>
    res.render('room-form', { title: 'עריכת חדרים' })
);
app.get('/messages', isAuthenticated, (req, res) =>
    res.render('messages', { title: 'הודעות' })
);

// ─── FETCH SCHEDULE DATA ──────────────────────────────────────────────────────
app.get('/fetchDataByDate', isAuthenticated, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const date = req.query.date
            || moment().tz('Asia/Jerusalem').format('YYYY-MM-DD');
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(
            `SELECT selected_date, names, color, startTime, endTime, roomNumber
         FROM selected_dates_2_${clinic}
        WHERE selected_date = ?`,
            [date]
        );
        conn.release();
        res.json(rows);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// ─── SUBMIT & DELETE BOOKINGS, MESSAGES, DYNAMIC ROOM VIEW ────────────────
// …the rest of your routes remain exactly the same…
// ─── SUBMIT BOOKING ────────────────────────────────────────────────────────────
app.post('/submit', isAuthenticated, isAdmin, async (req, res) => {
    const {
        selectedDate,
        names,
        selectedColor,
        startTime,
        endTime,
        roomNumber,
        recurringEvent,
        recurringNum
    } = req.body;

    const clinic = req.user.clinic;
    const conn = await pool.getConnection();

    try {
        // 1) Begin transaction
        await conn.beginTransaction();

        // 2) Insert booking(s)
        if (recurringEvent) {
            const times = parseInt(recurringNum, 10);
            for (let i = 0; i < times; i++) {
                const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                await conn.execute(
                    `INSERT INTO selected_dates_2_${clinic}
            (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent, recurringNum)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [nextDate, names, selectedColor, startTime, endTime, roomNumber, true, times]
                );
            }
        } else {
            await conn.execute(
                `INSERT INTO selected_dates_2_${clinic}
          (selected_date, names, color, startTime, endTime, roomNumber, recurringEvent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [selectedDate, names, selectedColor, startTime, endTime, roomNumber, false]
            );
        }

        // 3) Commit & release
        await conn.commit();
        conn.release();

        // 4) If the slot is פנוי, notify via WhatsApp
        if (names.trim() === 'פנוי') {
            const subject = `חדר ${roomNumber} פנוי!`;
            const text = `חדר ${roomNumber} פנוי בתאריך ${selectedDate} בין ${startTime} ל–${endTime}`;
            // const to = '+972' + '0509916633'.slice(1);
            const recipients = [
                '+972508294194',  // e.g. your first user
                '+972509916633',
                '+972507779390' // another user…
            ];

            const toEmails = clinicEmailRecipients[clinic] || [];
            if (toEmails.length) {
                await sendMail(subject, text, toEmails);
                console.log('✅ Notification email sent to:', toEmails);
            }

            const toSMS = clinicSmsRecipients[clinic] || [];
            for (const nr of toSMS) {
                await sendSMS(nr, text);
                console.log(`📲 SMS sent to ${nr}`);
            }

            // try {
            //     await sendMail(subject, text);
            //     console.log('✅ Notification email sent');
            // } catch (mailErr) {
            //     console.error('❌ sendMail error:', mailErr);
            // }
            //emails are defined in railway variables

            // try {
            //     await sendSMS(to, text);
            //     console.log(`✅ SMS sent to ${to}`);
            // } catch (err) {
            //     console.error(`❌ SMS error for ${to}:`, err);
            // }

            // for (const to of recipients) {
            //     try {
            //         await sendSMS(to, text);
            //         console.log(`✅ SMS sent to ${to}`);
            //     } catch (smsErr) {
            //         console.error(`❌ SMS error for ${to}:`, smsErr);
            //     }
            // }
            //phone numbers are defined in array above
        }

        return res.json({ success: true, message: 'Room scheduled successfully.' });

    } catch (err) {
        // Roll back on error
        await conn.rollback();
        conn.release();
        console.error(err);
        res.status(500).send(err.message);
    }
});

// ─── DELETE BOOKING ────────────────────────────────────────────────────────────
app.delete('/deleteEntry', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selected_date, roomNumber, startTime } = req.body;
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        await conn.execute(
            `DELETE FROM selected_dates_2_${clinic}
         WHERE selected_date = ?
           AND roomNumber    = ?
           AND startTime     = ?`,
            [selected_date, roomNumber, startTime]
        );
        conn.release();
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// ─── MESSAGES API ─────────────────────────────────────────────────────────────
app.get('/get_last_messages', isAuthenticated, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const [rows] = await pool.query(
            `SELECT * FROM messages_${clinic}
       ORDER BY id DESC
       LIMIT 10`
        );
        res.json({
            messages: rows.map(r => r.message),
            messageIds: rows.map(r => r.id)
        });
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
        const [r] = await conn.execute(
            `INSERT INTO messages_${clinic}(message) VALUES(?)`,
            [message]
        );
        conn.release();

        res.json({ messageId: r.insertId });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/delete_message', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const messageId = parseInt(req.body.messageId, 10);
        const clinic = req.user.clinic;
        const conn = await pool.getConnection();
        await conn.execute(
            `DELETE FROM messages_${clinic} WHERE id=?`,
            [messageId]
        );
        conn.release();
        res.send('Deleted');
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// ─── DYNAMIC ROOM VIEW ───────────────────────────────────────────────────────
app.get('/room/:roomNumber', isAuthenticated, async (req, res) => {
    try {
        const roomNumber = req.params.roomNumber;
        const clinic = req.user.clinic;
        const today = moment().tz('Asia/Jerusalem').format('YYYY-MM-DD');
        const conn = await pool.getConnection();
        const [rows] = await conn.execute(
            `SELECT * FROM selected_dates_2_${clinic}
         WHERE selected_date = ?
           AND roomNumber    = ?`,
            [today, roomNumber]
        );
        conn.release();

        const now = moment().tz('Asia/Jerusalem');
        let currentTherapist = null;
        for (const r of rows) {
            const s = moment.tz(r.startTime, 'HH:mm:ss', 'Asia/Jerusalem');
            const e = moment.tz(r.endTime, 'HH:mm:ss', 'Asia/Jerusalem');
            if (now.isSameOrAfter(s) && now.isBefore(e)) {
                currentTherapist = { name: r.names, endTime: e.format('HH:mm') };
                break;
            }
        }

        const todayLocalized = now.format('dddd D/M/YYYY');

        // *** Pass `title` here so navbar.ejs has it ***
        res.render('room', {
            title: `חדר ${roomNumber}`,
            roomNumber,
            currentTherapist,
            data: rows,
            moment,
            todayLocalized,
        });
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});



// ─── FAVICON & ERROR HANDLER ───────────────────────────────────────────────
app.get('/favicon.ico', (req, res) => res.status(204));
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).send(`Server error: ${err.message}`);
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(port, '0.0.0.0', () =>
    console.log(`Listening on port ${port}`)
);
