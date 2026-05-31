// backend/controllers/reportController.js
// Uses Groq API (completely free) for AI chat + MySQL for reports

const { getPool } = require('../db/mysql');

// ── AI CHAT using Groq ────────────────────────────────────────
exports.aiChat = async (req, res) => {
    const { message, history } = req.body;

    if (!message || !message.trim())
        return res.status(400).json({ success: false, response: 'No message provided.' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        console.error('GROQ_API_KEY not set in .env');
        return res.status(500).json({
            success: false,
            response: 'AI service not configured. Please set GROQ_API_KEY in your .env file.',
        });
    }

    try {
        // Build messages array for multi-turn conversation
        const messages = [
            {
                role: 'system',
                content: `You are SwiftCare AI, an emergency first-aid assistant integrated into a medical emergency response application.
Your role is to provide clear, calm, and accurate first-aid guidance to people helping a patient in an emergency before professional medical help arrives.

Guidelines:
- Give concise, step-by-step first-aid instructions based on the described symptoms or situation.
- Always remind the user to call emergency services (ambulance) if the situation is serious.
- Cover pre-treatment actions: what to do immediately, what NOT to do, and how to keep the patient stable.
- Be empathetic and calm — the person may be panicking.
- Do NOT diagnose medical conditions. Only provide first-aid guidance.
- If the situation is life-threatening (cardiac arrest, severe bleeding, unconsciousness), emphasize calling emergency services FIRST.
- Keep responses short and actionable — use numbered steps when possible.
- End each response with a reminder to seek professional medical help immediately.`,
            },
        ];

        // Add conversation history
        if (history && Array.isArray(history)) {
            history.forEach((msg) => {
                messages.push({
                    role: msg.sender === 'user' ? 'user' : 'assistant',
                    content: msg.text,
                });
            });
        }

        // Add current user message
        messages.push({ role: 'user', content: message });

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages,
                max_tokens: 512,
                temperature: 0.4,
            }),
        });

        if (!groqRes.ok) {
            const errData = await groqRes.json();
            console.error('Groq API error:', errData);
            return res.status(502).json({ success: false, response: 'AI service error. Please try again.' });
        }

        const data = await groqRes.json();
        const aiReply = data.choices?.[0]?.message?.content
            || 'I could not generate a response. Please try again.';

        res.json({ success: true, response: aiReply });

    } catch (err) {
        console.error('AI chat error:', err.message);
        res.status(500).json({ success: false, response: 'Server error while contacting AI. Please try again.' });
    }
};

// ── SAVE REPORT ───────────────────────────────────────────────
exports.generateReport = async (req, res) => {
    const { patientEmail, conversationHistory, finalSummary } = req.body;
    const pool = getPool();
    try {
        const [result] = await pool.execute(
            'INSERT INTO reports (patient_email, conversation, final_summary, status) VALUES (?, ?, ?, ?)',
            [patientEmail, JSON.stringify(conversationHistory), finalSummary, 'final']
        );
        res.status(201).json({ success: true, message: 'Report saved successfully.', reportId: result.insertId });
    } catch (err) {
        console.error('Report save error:', err);
        res.status(500).json({ success: false, message: 'Could not save report.' });
    }
};

// ── GET PATIENT REPORTS ───────────────────────────────────────
exports.getPatientReports = async (req, res) => {
    const { email } = req.params;
    const pool = getPool();
    try {
        if ((req.role === 'user' || req.role === 'patient') && req.userEmail !== email) {
            return res.status(403).json({ success: false, message: 'Unauthorized.' });
        }
        const [rows] = await pool.execute(
            'SELECT * FROM reports WHERE patient_email = ? ORDER BY created_at DESC',
            [email]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not retrieve reports.' });
    }
};

// ── GET ALL REPORTS (Admin/Doctor) ────────────────────────────
exports.getAllReports = async (req, res) => {
    const pool = getPool();
    try {
        const [rows] = await pool.execute('SELECT * FROM reports ORDER BY created_at DESC');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ success: false, message: 'Could not retrieve reports.' });
    }
};
