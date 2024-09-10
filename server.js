const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
app.use(bodyParser.json());

const verificationCodes = {};
const users = {};

const generateCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const saltRounds = 10;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password'
    }
});

app.post('/send-verification', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).send('Email is required');

    const verificationCode = generateCode();
    verificationCodes[email] = verificationCode;

    const mailOptions = {
        from: 'your-email@gmail.com',
        to: email,
        subject: 'Your Verification Code',
        text: `Your verification code is: ${verificationCode}`
    };

    transporter.sendMail(mailOptions, (error) => {
        if (error) {
            return res.status(500).send('Error sending email');
        }
        res.send('Verification code sent');
    });
});

app.post('/verify-code', (req, res) => {
    const { email, verificationCode, password } = req.body;
    if (!email || !verificationCode || !password) return res.status(400).send('All fields are required');

    if (verificationCodes[email] && verificationCodes[email] === verificationCode) {
        bcrypt.hash(password, saltRounds, (err, hash) => {
            if (err) return res.status(500).send('Error encrypting password');

            users[email] = { email, password: hash };
            delete verificationCodes[email];
            res.send('Account created successfully');
        });
    } else {
        res.status(400).send('Invalid verification code');
    }
});

app.listen(3000, () => {
    console.log('Server running on port 3000');
});
