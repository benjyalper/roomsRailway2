import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import pg from 'pg';
const { Pool } = pg;
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
import { clinicRooms, TIMES } from './config/clinic-rooms.js';
import { parsePdfSchedule } from './utils/pdf-import.js';
import ExcelJS from 'exceljs';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });




dotenv.config();
const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT || 3000;

// ─── STATIC FILES (except index.html) ───────────────────────────────────────
// Images get a 30-day cache so iOS doesn't re-fetch newRoom.png on every visit
app.use('/images', express.static('public/images', { maxAge: '30d', immutable: true }));
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
    { id: 18, phone: '0504444444', role: 'user', clinic: 'marbah' },
    { id: 19, phone: '0505555522', role: 'user', clinic: 'marbah' },
    { id: 20, phone: '0524393500', role: 'admin', clinic: 'marbah' },
    { id: 21, phone: '0546718945', role: 'admin', clinic: 'marbah' },
    { id: 22, phone: '0590909090', role: 'admin', clinic: 'marbah' },
    //demo1 users
    { id: 23, phone: '0505555555', role: 'admin', clinic: 'demo1' },
    { id: 24, phone: '0502476078', role: 'admin', clinic: 'demo1' },
    { id: 25, phone: '0547515021', role: 'admin', clinic: 'demo1' },
    //nefesh users
    { id: 26, phone: '0501234567', role: 'admin', clinic: 'nefesh' },
    //clalit users
    { id: 27, phone: '0501234568', role: 'admin', clinic: 'clalit' }
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
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false }
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
// מיפוי מפתח המרפאה לשם קריא (display name) בעברית
const clinicDisplayNames = {
    marbah: 'מרבך ילד ונוער',
    clalit: 'מרפאת כללית',
    demo1: 'מרפאת ילד ונוער',
    nefesh: 'מרפאת בריאות הנפש',
    // הוסיפו כאן מיפויים נוספים לפי הצורך
};

app.get('/home', isAuthenticated, (req, res) => {
    // 1) נקודת כניסה: קבלת המפתח (key) של המרפאה מהמשתמש
    const clinic = req.user.clinic;            // למשל: "marbah" או "clalit"

    // 2) מציאת השם לקריאה (display name) מתוך המיפוי, או שימוש במפתח עצמו אם לא קיים מיפוי
    const clinicName = clinicDisplayNames[clinic] || clinic;

    // 3) שליפת רשימת החדרים בהתאם למפתח המרפאה (או מערך ריק אם אין ערך בעבור המפתח)
    const rooms = clinicRooms[clinic] || [];

    // 4) רינדור התבנית home.ejs עם כל המשתנים הדרושים
    res.render('home', {
        title: 'סידור חדרים',
        rooms,
        clinicName
    });
});



app.get('/room-schedule', isAuthenticated, (req, res) => {
    const clinic = req.user.clinic;
    const rooms = clinicRooms[clinic] || [];
    const times = TIMES[clinic] || [];
    const clinicName = clinicDisplayNames[clinic] || clinic;

    res.render('room-schedule', {
        title: 'טבלת חדרים',
        rooms,
        TIMES: times,
        clinicName
    });
});

app.get('/room-form', isAuthenticated, (req, res) => {
    const clinic = req.user.clinic;
    const rooms = clinicRooms[clinic] || [];
    const times = TIMES[clinic] || [];
    const clinicName = clinicDisplayNames[clinic] || clinic;

    console.log('🕒 Rendering room-form with TIMES:', times);

    res.render('room-form', {
        title: 'עריכת חדרים',
        rooms,
        TIMES: times,
        clinicName
    });
});


app.get('/messages', isAuthenticated, (req, res) => {
    const clinic = req.user.clinic;
    const clinicName = clinicDisplayNames[clinic] || clinic;
    res.render('messages', { title: 'הודעות', clinicName });
});

// ─── FETCH SCHEDULE DATA ──────────────────────────────────────────────────────
app.get('/fetchDataByDate', isAuthenticated, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const date = req.query.date
            || moment().tz('Asia/Jerusalem').format('YYYY-MM-DD');
        const result = await pool.query(
            `SELECT id, selected_date, names, color,
                    starttime AS "startTime", endtime AS "endTime", roomnumber AS "roomNumber"
             FROM selected_dates_2_${clinic}
             WHERE selected_date = $1`,
            [date]
        );
        res.json(result.rows);
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
    const client = await pool.connect();

    try {
        // 1) Begin transaction
        await client.query('BEGIN');

        // 2) Insert booking(s)
        if (recurringEvent) {
            const times = parseInt(recurringNum, 10);
            for (let i = 0; i < times; i++) {
                const nextDate = moment(selectedDate).add(i, 'weeks').format('YYYY-MM-DD');
                await client.query(
                    `INSERT INTO selected_dates_2_${clinic}
                     (selected_date, names, color, starttime, endtime, roomnumber, recurringevent, recurringnum)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [nextDate, names, selectedColor, startTime, endTime, roomNumber, true, times]
                );
            }
        } else {
            await client.query(
                `INSERT INTO selected_dates_2_${clinic}
                 (selected_date, names, color, starttime, endtime, roomnumber, recurringevent)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [selectedDate, names, selectedColor, startTime, endTime, roomNumber, false]
            );
        }

        // 3) Commit & release
        await client.query('COMMIT');
        client.release();

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
        await client.query('ROLLBACK');
        client.release();
        console.error(err);
        res.status(500).send(err.message);
    }
});

// ─── DELETE BOOKING ────────────────────────────────────────────────────────────

app.delete('/deleteEntry', isAuthenticated, isAdmin, async (req, res) => {
    const { id } = req.body;
    const clinic = req.user.clinic;
    try {
        await pool.query(
            `DELETE FROM selected_dates_2_${clinic} WHERE id = $1`,
            [id]
        );
        res.sendStatus(200);
    } catch (e) {
        console.error(e);
        res.status(500).send(e.message);
    }
});

// ─── DELETE RECURRING ───────────────────────────────────────────────────────
app.delete('/deleteRecurring', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const { selectedDate, roomNumber, startTime } = req.body;
        const clinic = req.user.clinic;

        await pool.query(
            `DELETE FROM selected_dates_2_${clinic}
             WHERE roomnumber = $1
               AND starttime  = $2
               AND selected_date >= $3`,
            [roomNumber, startTime, selectedDate]
        );

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
        const result = await pool.query(
            `SELECT * FROM messages_${clinic}
             ORDER BY id DESC
             LIMIT 10`
        );
        res.json({
            messages: result.rows.map(r => r.message),
            messageIds: result.rows.map(r => r.id)
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
        const result = await pool.query(
            `INSERT INTO messages_${clinic}(message) VALUES($1) RETURNING id`,
            [message]
        );
        res.json({ messageId: result.rows[0].id });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/delete_message', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const messageId = parseInt(req.body.messageId, 10);
        const clinic = req.user.clinic;
        await pool.query(
            `DELETE FROM messages_${clinic} WHERE id=$1`,
            [messageId]
        );
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
        const result = await pool.query(
            `SELECT * FROM selected_dates_2_${clinic}
             WHERE selected_date = $1
               AND roomnumber    = $2`,
            [today, roomNumber]
        );
        const rows = result.rows;

        const now = moment().tz('Asia/Jerusalem');
        let currentTherapist = null;
        for (const r of rows) {
            const s = moment.tz(r.starttime, 'HH:mm:ss', 'Asia/Jerusalem');
            const e = moment.tz(r.endtime, 'HH:mm:ss', 'Asia/Jerusalem');
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



// ─── IMPORT PDF ────────────────────────────────────────────────────────────────
app.post('/import-pdf', isAuthenticated, isAdmin, upload.single('pdfFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });

    try {
        const entries = await parsePdfSchedule(req.file.buffer, req.file.originalname);
        if (!entries.length) return res.status(422).json({ error: 'לא נמצאו נתונים בקובץ' });

        // Build an Excel workbook from the parsed entries (no DB insert yet)
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('סידור חדרים', { views: [{ rightToLeft: true }] });
        ws.columns = [
            { header: 'תאריך',  key: 'date',       width: 14 },
            { header: 'מטפל',   key: 'names',      width: 28 },
            { header: 'חדר',    key: 'roomNumber', width: 8  },
            { header: 'התחלה', key: 'startTime',  width: 10 },
            { header: 'סיום',   key: 'endTime',    width: 10 },
            { header: 'צבע',    key: 'color',      width: 12 }
        ];
        // Force these columns to text so Excel doesn't auto-format
        ws.getColumn('date').numFmt      = '@';
        ws.getColumn('startTime').numFmt = '@';
        ws.getColumn('endTime').numFmt   = '@';

        entries.forEach(e => ws.addRow({
            date:       e.date,
            names:      e.names,
            roomNumber: e.roomNumber,
            startTime:  e.startTime,
            endTime:    e.endTime,
            color:      e.color
        }));
        ws.getRow(1).font = { bold: true };

        const buffer = await wb.xlsx.writeBuffer();
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="schedule-review-${Date.now()}.xlsx"`);
        res.send(Buffer.from(buffer));
    } catch (err) {
        console.error('PDF import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── IMPORT EXCEL → inserts the reviewed rows into the DB ──────────────────
app.post('/import-excel', isAuthenticated, isAdmin, upload.single('xlsxFile'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });

    try {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(req.file.buffer);
        const ws = wb.worksheets[0];
        if (!ws) return res.status(422).json({ error: 'הקובץ ריק' });

        const toStr = v => {
            if (v == null) return '';
            if (v instanceof Date) return v.toISOString();
            if (typeof v === 'object' && v.text)   return v.text;
            if (typeof v === 'object' && v.result !== undefined) return String(v.result);
            return String(v);
        };
        const formatDate = v => {
            if (v instanceof Date) return moment(v).format('YYYY-MM-DD');
            const s = toStr(v).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
                const [d, m, y] = s.split('/');
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
            return null;
        };
        const formatTime = v => {
            if (v instanceof Date) return moment(v).format('HH:mm');
            const s = toStr(v).trim();
            if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
            return null;
        };

        const entries = [];
        ws.eachRow((row, rowNum) => {
            if (rowNum === 1) return;             // skip header
            const v = row.values;                 // 1-indexed
            const date       = formatDate(v[1]);
            const names      = toStr(v[2]).trim();
            const roomNumber = toStr(v[3]).trim();
            const startTime  = formatTime(v[4]);
            const endTime    = formatTime(v[5]);
            const color      = toStr(v[6]).trim() || '#79c2b3';
            if (!date || !names || !roomNumber || !startTime || !endTime) return;
            entries.push({ date, names, roomNumber, startTime, endTime, color });
        });

        if (!entries.length) return res.status(422).json({ error: 'לא נמצאו רשומות תקינות' });

        const clinic = req.user.clinic;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const e of entries) {
                await client.query(
                    `INSERT INTO selected_dates_2_${clinic}
                     (selected_date, names, color, starttime, endtime, roomnumber, recurringevent)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [e.date, e.names, e.color, e.startTime, e.endTime, e.roomNumber, false]
                );
            }
            await client.query('COMMIT');
            res.json({ success: true, inserted: entries.length });
        } catch (dbErr) {
            await client.query('ROLLBACK');
            throw dbErr;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Excel import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── ERASE ALL DATA (admin only) ────────────────────────────────────────────
app.post('/erase-all', isAuthenticated, isAdmin, async (req, res) => {
    try {
        const clinic = req.user.clinic;
        const result = await pool.query(`DELETE FROM selected_dates_2_${clinic}`);
        res.json({ success: true, deleted: result.rowCount });
    } catch (err) {
        console.error('erase-all error:', err);
        res.status(500).json({ error: err.message });
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
