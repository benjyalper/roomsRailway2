// utils/mail.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// configure the SMTP transporter
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',  // true on port 465, false on 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * Send a plain-text email.
 * @param {string} subject
 * @param {string} text
 */
export function sendMail(subject, text) {
    return transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,   // comma-separated list if you have multiple
        subject,
        text
    });
}
