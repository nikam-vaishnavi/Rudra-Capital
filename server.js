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

// Email setup - BULLETPROOF VERSION
let transporter = null;

// Safe email initialization
function initializeEmailTransporter() {
    try {
        // Only initialize if both environment variables exist
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            transporter = nodemailer.createTransporter({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
            console.log('✅ Email transporter initialized successfully');
        } else {
            console.log('⚠️  Email credentials not found - email notifications disabled');
            console.log('   Set EMAIL_USER and EMAIL_PASS environment variables to enable emails');
        }
    } catch (error) {
        console.log('❌ Failed to initialize email transporter:', error.message);
        console.log('   Server will continue without email functionality');
    }
}

// Initialize email with error handling
initializeEmailTransporter();

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
        console.log('✅ Database table ready');
    } catch (error) {
        console.error('❌ Database initialization error:', error.message);
    }
}

// Initialize database
initDB();

// API Routes
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, phone, subject, message } = req.body;
        
        // Save to database first
        const result = await pool.query(
            'INSERT INTO contacts (name, email, phone, subject, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, email, phone, subject, message]
        );
        
        console.log('✅ Contact saved to database');
        
        // Send email notification only if transporter is available
        if (transporter) {
            try {
                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: process.env.EMAIL_USER,
                    subject: `📧 New Contact: ${subject}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #1a3a5f;">New Contact Form Submission</h2>
                            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                <p><strong>Name:</strong> ${name}</p>
                                <p><strong>Email:</strong> ${email || 'Not provided'}</p>
                                <p><strong>Phone:</strong> ${phone}</p>
                                <p><strong>Subject:</strong> ${subject}</p>
                                <p><strong>Message:</strong></p>
                                <p style="background: white; padding: 15px; border-left: 4px solid #1a3a5f;">${message}</p>
                                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
                            </div>
                            <p style="color: #666; font-size: 12px;">This message was sent from Rudra Capital website</p>
                        </div>
                    `
                };
                
                await transporter.sendMail(mailOptions);
                console.log('✅ Email notification sent successfully');
            } catch (emailError) {
                console.log('⚠️  Email sending failed:', emailError.message);
                // Don't fail the request if email fails
            }
        }
        
        res.status(201).json({ 
            success: true, 
            message: 'Contact form submitted successfully',
            data: result.rows[0] 
        });
    } catch (error) {
        console.error('❌ Error saving contact:', error.message);
        res.status(500).json({ 
            success: false, 
            message: 'Error saving contact. Please try again.' 
        });
    }
});

app.get('/api/contacts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY date DESC');
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error fetching contacts:', error.message);
        res.status(500).json({ success: false });
    }
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log('🚀 Server started successfully');
    console.log(`📍 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});