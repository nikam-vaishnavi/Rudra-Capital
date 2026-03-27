const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Keep server awake on free tier
setInterval(() => {
    if (process.env.RENDER_EXTERNAL_URL) {
        require('http').get(process.env.RENDER_EXTERNAL_URL);
    }
}, 600000);

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Email setup - FIXED VERSION
let transporter = null;

// Initialize email transporter only when environment variables are available
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
    console.log('Email transporter initialized');
} else {
    console.log('Email environment variables not set - email notifications disabled');
}

// Create table on startup
async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255),
                phone VARCHAR(50) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status VARCHAR(50) DEFAULT 'New'
            )
        `);
        console.log('Database table created/verified');
    } catch (error) {
        console.error('Database initialization error:', error);
    }
}

initDB();

// API Routes
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        // Save to database
        const result = await pool.query(
            'INSERT INTO contacts (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, email, phone, subject, message]
        );
        
        // Send email notification only if transporter is available
        if (transporter) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER,
                    subject: `New Contact: ${subject}`,
                    html: `
                        <h2>New Contact Form Submission</h2>
                        <p><strong>Name:</strong> ${name}</p>
                        <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                        <p><strong>Phone:</strong> ${phone}</p>
                        <p><strong>Subject:</strong> ${subject}</p>
                        <p><strong>Message:</strong> ${message}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                    `
                };
                
                await transporter.sendMail(mailOptions);
                console.log('Email notification sent');
            } catch (emailError) {
                console.error('Email sending failed:', emailError);
                // Don't fail the request if email fails
            }
        } else {
            console.log('Email not sent - transporter not initialized');
        }
        
        console.log('Contact saved successfully');
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error saving contact:', error);
        res.status(500).json({ success: false, message: 'Error saving contact' });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY date DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching contacts:', error);
        res.status(500).json({ success: false });
    }
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});