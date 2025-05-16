import twilio from 'twilio';
import dotenv from 'dotenv';
dotenv.config();  // loads Railway’s env vars in production, your .env locally

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send a WhatsApp message via Twilio.
 * @param {string} to - E.164 phone (e.g. "+972501234567").
 * @param {string} body - Text of the message.
 */
export function sendWhatsApp(to, body) {
    return client.messages.create({
        from: process.env.TWILIO_PHONE_NUMBER,     // e.g. 'whatsapp:+14155238886'
        to: `whatsapp:${to}`,                       // e.g. 'whatsapp:+972501234567'
        body
    });
}
