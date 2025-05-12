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
    { id: 4, phone: '0503333333', role: 'user', clinic: 'marbah' },
    { id: 5, phone: '0504444444', role: 'user', clinic: 'clalit' },
    { id: 6, phone: '0505555555', role: 'user', clinic: 'marbah' }
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
    res.render('home', { title: 'דף ראשי' });
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
