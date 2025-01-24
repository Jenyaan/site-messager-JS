var sqlite3 = require('sqlite3').verbose();

var DBSOURCE = "./db/db.sqlite";

var db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        console.error(err.message);
        throw err;
    } else {
        console.log('Connected to the SQLite database.');

        // Создание таблицы пользователей
        const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            image TEXT NOT NULL,
            description TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        );
        `;

        db.run(createUsersTable, (err) => {
            if (err) {
                console.log("Table users already created: " + err.message);
            } else {
                console.log("Table users is created.");
            }
        });

        // Создание таблицы постов
        const createPostsTable = `
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            author_id INTEGER NOT NULL,
            body TEXT,
            FOREIGN KEY (author_id) REFERENCES users (id)
        );
        `;

        db.run(createPostsTable, (err) => {
            if (err) {
                console.log("Table posts already created: " + err.message);
            } else {
                console.log("Table posts is created.");
            }
        });

        // Создание таблицы комментариев
        const createCommentsTable = `
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            author_id INTEGER NOT NULL,
            comment TEXT NOT NULL,
            post_id INTEGER NOT NULL,
            FOREIGN KEY (author_id) REFERENCES users (id),
            FOREIGN KEY (post_id) REFERENCES posts (id)
        );
        `;

        db.run(createCommentsTable, (err) => {
            if (err) {
                console.log("Table comments already created: " + err.message);
            } else {
                console.log("Table comments is created.");
            }
        });

        // Добавление нескольких пользователей
        // const addUsers = `
        // INSERT INTO users (name, username, image, description, email, password)
        // VALUES
        //     ('Іван Петров', 'ivan.petrov', 'https://via.placeholder.com/100', 'Розробник програмного забезпечення', 'ivan.petrov@example.com', 'password123'),
        //     ('Ольга Коваль', 'olga.koval', 'https://via.placeholder.com/100', 'Дизайнер', 'olga.koval@example.com', 'password123'),
        //     ('Дмитро Бойко', 'dmytro.boyko', 'https://via.placeholder.com/100', 'Маркетолог', 'dmytro.boyko@example.com', 'password123'),
        //     ('Марія Савчук', 'maria.savchuk', 'https://via.placeholder.com/100', 'Менеджер проектів', 'maria.savchuk@example.com', 'password123'),
        //     ('Анна Романюк', 'anna.romanyuk', 'https://via.placeholder.com/100', 'Копірайтер', 'anna.romanyuk@example.com', 'password123');
        // `;

        // db.run(addUsers, (err) => {
        //     if (err) {
        //         console.log("Users already inserted: " + err.message);
        //     } else {
        //         console.log("Users are inserted.");
        //     }
        // });

    }
});

module.exports = db;
