const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Schema } = mongoose;

const app = express();
const port = 3000;

app.use(bodyParser.json());

mongoose.connect('mongodb://localhost/versecraft', { useNewUrlParser: true, useUnifiedTopology: true });

const UserSchema = new Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    verificationCode: String,
    isVerified: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-email-password'
    }
});

app.post('/api/create-account', async (req, res) => {
    try {
        const { email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationCode = crypto.randomBytes(20).toString('hex');
        
        const user = new User({
            email,
            password: hashedPassword,
            verificationCode
        });

        await user.save();

        await transporter.sendMail({
            to: email,
            subject: 'Account Verification',
            text: `Your verification code is: ${verificationCode}`
        });

        res.status(200).send('Verification code sent to your email.');
    } catch (error) {
        res.status(500).send('Error creating account.');
    }
});

app.post('/api/verify-code', async (req, res) => {
    try {
        const { verificationCode } = req.body;
        const user = await User.findOne({ verificationCode });

        if (!user) {
            return res.status(400).send('Invalid verification code.');
        }

        user.isVerified = true;
        user.verificationCode = null;
        await user.save();

        res.status(200).send('Account created successfully.');
    } catch (error) {
        res.status(500).send('Error verifying code.');
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
