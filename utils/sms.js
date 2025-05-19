// utils/sms.js
import Twilio from 'twilio';

const client = Twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send an SMS via Twilio.
 * @param {string} to   E.164 phone number (e.g. "+972501234567")
 * @param {string} body Message body
 */
export async function sendSMS(to, body) {
    return client.messages.create({
        to,
        from: process.env.TWILIO_PHONE_NUMBER,
        body
    });
}
