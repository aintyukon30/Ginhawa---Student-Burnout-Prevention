const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const DB_DIR = path.join(__dirname);

const tables = {
    users: path.join(DB_DIR, 'users.csv'),
    metrics: path.join(DB_DIR, 'metrics.csv'),
    grades: path.join(DB_DIR, 'grades.csv'),
    alerts: path.join(DB_DIR, 'alerts.csv')
};

// Initialize CSV files if they don't exist
function init() {
    if (!fs.existsSync(tables.users)) {
        fs.writeFileSync(tables.users, stringify([['id', 'email', 'password', 'role', 'school_code', 'onboarded']], { header: false }));
    }
    if (!fs.existsSync(tables.metrics)) {
        fs.writeFileSync(tables.metrics, stringify([['id', 'user_id', 'date', 'sleep_hours', 'study_hours', 'stress_level']], { header: false }));
    }
    if (!fs.existsSync(tables.grades)) {
        fs.writeFileSync(tables.grades, stringify([['id', 'user_id', 'subject', 'score', 'date']], { header: false }));
    }
    if (!fs.existsSync(tables.alerts)) {
        fs.writeFileSync(tables.alerts, stringify([['id', 'user_id', 'type', 'message', 'severity', 'created_at']], { header: false }));
    }
}

function read(table) {
    const content = fs.readFileSync(tables[table], 'utf8');
    return parse(content, { columns: true, skip_empty_lines: true, cast: true });
}

function write(table, data) {
    const csv = stringify(data, { header: true });
    fs.writeFileSync(tables[table], csv);
}

function getNextId(table) {
    const data = read(table);
    if (data.length === 0) return 1;
    return Math.max(...data.map(d => d.id)) + 1;
}

const csvDB = {
    users: {
        findAll: () => read('users'),
        findOne: (query) => {
            const data = read('users');
            return data.find(u => Object.keys(query).every(key => u[key] === query[key]));
        },
        insert: (user) => {
            const data = read('users');
            user.id = getNextId('users');
            user.onboarded = user.onboarded || 0;
            data.push(user);
            write('users', data);
            return user;
        },
        update: (id, updates) => {
            const data = read('users');
            const index = data.findIndex(u => u.id === id);
            if (index !== -1) {
                data[index] = { ...data[index], ...updates };
                write('users', data);
            }
        }
    },
    metrics: {
        findAll: (query) => {
            const data = read('metrics');
            let filtered = data.filter(m => Object.keys(query).every(key => m[key] === query[key]));
            return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        },
        insert: (metric) => {
            const data = read('metrics');
            metric.id = getNextId('metrics');
            metric.date = metric.date || new Date().toISOString().split('T')[0];
            data.push(metric);
            write('metrics', data);
            return metric;
        }
    },
    grades: {
        findAll: (query) => {
            const data = read('grades');
            let filtered = data.filter(g => Object.keys(query).every(key => g[key] === query[key]));
            return filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
        },
        insert: (grade) => {
            const data = read('grades');
            grade.id = getNextId('grades');
            grade.date = grade.date || new Date().toISOString().split('T')[0];
            data.push(grade);
            write('grades', data);
            return grade;
        }
    }
};

module.exports = { csvDB, init };
