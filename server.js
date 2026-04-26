require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { csvDB, init: initDB } = require('./db/csvDB');
const path = require('path');

const app = express();
initDB();
const PORT = process.env.PORT || 3000;

// Middleware
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Auth Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.userId) return next();
    res.redirect('/login');
};

// Burnout Logic Helper
function calculateBurnoutRisk(metrics, grades) {
    let score = 0;
    let reasons = [];

    if (metrics.length > 0) {
        const latest = metrics[0];
        if (latest.sleep_hours < 6) { score += 30; reasons.push("Low sleep (< 6h)"); }
        if (latest.study_hours > 8) { score += 20; reasons.push("High study hours (> 8h)"); }
        if (latest.stress_level >= 4) { score += 30; reasons.push("High self-reported stress"); }
    }

    if (grades.length >= 2) {
        const recent = grades[0].score;
        const previous = grades[1].score;
        if (recent < previous * 0.9) {
            score += 20;
            reasons.push("Grades dropping > 10%");
        }
    }

    let level = 'Low';
    let color = 'text-green-500';
    if (score >= 60) { level = 'High'; color = 'text-red-500'; }
    else if (score >= 30) { level = 'Moderate'; color = 'text-yellow-500'; }

    return { score, level, color, reasons };
}

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    const user = csvDB.users.findOne({ email });
    if (user && bcrypt.compareSync(password, user.password)) {
        req.session.userId = user.id;
        req.session.user = user;
        if (user.role === 'student' && !user.onboarded) return res.redirect('/onboarding');
        return res.redirect(user.role === 'student' ? '/dashboard' : '/counselor');
    }
    res.render('login', { error: 'Invalid credentials' });
});

app.get('/signup', (req, res) => res.render('signup', { error: null }));
app.post('/signup', (req, res) => {
    let { email, password, role, school_code } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    if (role === 'counselor') school_code = ''; // Ensure no school code for counselors
    try {
        if (csvDB.users.findOne({ email })) throw new Error('Exists');
        const user = csvDB.users.insert({ email, password: hashedPassword, role, school_code });
        req.session.userId = user.id;
        req.session.user = user;
        if (role === 'student') return res.redirect('/onboarding');
        res.redirect('/counselor');
    } catch (e) {
        res.render('signup', { error: 'Email already exists' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/onboarding', isAuthenticated, (req, res) => {
    res.render('onboarding');
});

app.post('/onboarding', isAuthenticated, (req, res) => {
    const { sleep, study, stress } = req.body;
    csvDB.metrics.insert({ user_id: req.session.userId, sleep_hours: parseFloat(sleep), study_hours: parseFloat(study), stress_level: parseInt(stress) });
    csvDB.users.update(req.session.userId, { onboarded: 1 });
    // Update session user object too
    req.session.user.onboarded = 1;
    res.redirect('/dashboard');
});

app.get('/dashboard', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'student') return res.redirect('/counselor');
    
    const metrics = csvDB.metrics.findAll({ user_id: req.session.userId }).slice(0, 7);
    const grades = csvDB.grades.findAll({ user_id: req.session.userId }).slice(0, 10);
    const risk = calculateBurnoutRisk(metrics, grades);
    
    res.render('dashboard', { user: req.session.user, metrics, grades, risk });
});

app.post('/api/metrics', isAuthenticated, (req, res) => {
    const { sleep, study, stress } = req.body;
    csvDB.metrics.insert({ user_id: req.session.userId, sleep_hours: parseFloat(sleep), study_hours: parseFloat(study), stress_level: parseInt(stress) });
    res.redirect('/dashboard');
});

app.post('/api/grades', isAuthenticated, (req, res) => {
    const { subject, score } = req.body;
    csvDB.grades.insert({ user_id: req.session.userId, subject, score: parseFloat(score) });
    res.redirect('/dashboard');
});

app.get('/counselor', isAuthenticated, (req, res) => {
    if (req.session.user.role !== 'counselor') return res.redirect('/dashboard');
    
    const allUsers = csvDB.users.findAll();
    const students = allUsers.filter(u => u.role === 'student').map(u => {
        const userMetrics = csvDB.metrics.findAll({ user_id: u.id });
        const last = userMetrics[0] || {};
        return {
            id: u.id,
            email: u.email,
            last_sleep: last.sleep_hours || null,
            last_study: last.study_hours || null,
            last_stress: last.stress_level || null
        };
    });

    // Process students to add risk levels (simplified for view)
    students.forEach(s => {
        const sMetrics = s.last_sleep ? [{sleep_hours: s.last_sleep, study_hours: s.last_study, stress_level: s.last_stress}] : [];
        const risk = calculateBurnoutRisk(sMetrics, []);
        s.riskLevel = risk.level;
        s.riskColor = risk.color;
    });

    res.render('counselor', { user: req.session.user, students });
});

app.get('/wellness', (req, res) => {
    res.render('wellness', { user: req.session.user });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
