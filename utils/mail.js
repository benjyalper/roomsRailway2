// utils/mail.js
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// <-- ADD THIS:
transporter.verify((err, success) => {
    if (err) {
        console.error('❌ SMTP connection failed:', err);
    } else {
        console.log('✅ SMTP connection OK');
    }
});

export async function sendMail(subject, text) {
    try {
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: process.env.EMAIL_TO,
            subject,
            text
        });
        console.log('✉️  sendMail info:', {
            messageId: info.messageId,
            accepted: info.accepted,
            rejected: info.rejected,
            envelope: info.envelope
        });
        return info;
    } catch (err) {
        console.error('🚨 sendMail threw error:', err);
        throw err;
    }
}

