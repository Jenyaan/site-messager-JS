// app.js
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./database');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const path = require('path');


const app = express();
const secretKey = '123'; // Замініть на ваш секретний ключ

// Middleware
app.use(cookieParser());
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'))
app.use('/bootstrap', express.static(__dirname + '/node_modules/bootstrap/dist'));

function authenticateToken(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        req.user = null; // Якщо токена немає, просто пропускаємо перевірку
        return next();
    }

    jwt.verify(token, secretKey, (err, user) => {
        if (err) {
            req.user = null; // Якщо токен недійсний, вважаємо, що користувач неавторизований
        } else {
            req.user = user; // Зберігаємо інформацію про користувача з токена
        }
        next();
    });
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/img'); // Визначення папки для збереження
    },
    filename: (req, file, cb) => {
        // Отримуємо розширення файлу на основі MIME-типу
        const extname = path.extname(file.originalname).toLowerCase();
        const filename = `${Date.now()}${extname}`; // Ім'я файлу складається з поточної дати та розширення
        cb(null, filename); // Встановлення імені файлу
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // Обмеження на розмір файлу 5 MB
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext !== '.jpg' && ext !== '.jpeg' && ext !== '.png') {
            return cb(new Error('Only image files are allowed.'));
        }
        cb(null, true);
    }
});
// Home Route

app.get('/', authenticateToken, (req, res) => {
    const query = `
    SELECT posts.*, users.name, users.image 
    FROM posts
    JOIN users ON posts.author_id = users.id
    LIMIT 5
`;
    const user_n = req.user; // Информация о текущем пользователе

    db.all(query, [], (err, posts) => {
        if (err) {
            return res.status(500).send('Помилка бази даних');
        }

        if (posts.length === 0) {
            return res.render('home', { user_n, posts: [] });
        }

        // Для каждого поста получаем комментарии
        const postsWithComments = [];
        let postsProcessed = 0;

        posts.forEach((post) => {
            const commentsQuery = `
                SELECT comments.*, users.image, users.name 
                FROM comments
                JOIN users ON comments.author_id = users.id
                WHERE post_id = ?
            `;
            db.all(commentsQuery, [post.id], (err, comments) => {
                if (err) {
                    return res.status(500).send('Помилка отримання коментарів');
                }

                // Добавляем комментарии к посту
                postsWithComments.push({
                    ...post,
                    comments: comments
                });

                postsProcessed++;

                // Когда все посты обработаны, отдаем страницу
                if (postsProcessed === posts.length) {
                    console.log(posts);
                    res.render('home', { user_n, posts: postsWithComments });
                }
            });
        });
    });
});


app.get('/search', authenticateToken, (req, res) => {
    const query = req.query.query;
    const user_n = req.user;

    if (!query) {
        return res.status(400).json({ error: 'Запит не може бути порожнім' });
    }

    if (!user_n) {
        return res.redirect('/login'); // Если пользователя нет, перенаправляем на страницу входа
    }

    const sqlQuery = `
        SELECT * FROM users
        WHERE (username LIKE ? OR name LIKE ?) AND id != ?`;

    const params = [`%${query}%`, `%${query}%`, user_n.id]; // Добавляем исключение для текущего пользователя

    db.all(sqlQuery, params, (err, users) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка при пошуку користувачів' });
        }

        res.render('search', { users, user_n }); // Отправляем данные на страницу результатов
    });
});

app.get('/create/post/:id', (req, res) => {
    const userId = req.params.id;
    res.render('create_post', { userId });
});

app.post('/create/post/:id', (req, res) => {
    console.log(req.body);
    const userId = req.params.id;
    const { title, content } = req.body;

    if (!title || !content) {
        return res.render('create_post', { error: 'Заповніть всі обов’язкові поля!' });
    }

    const query = `INSERT INTO posts (title, author_id, body) VALUES (?, ?, ?)`;
    db.run(query, [title, userId, content], function (err) {
        if (err) {
            console.error('Помилка при створенні поста:', err.message);
            return res.status(500).send('Помилка сервера');
        }

        // Перенаправлення на сторінку списку постів
        res.redirect(`/profile/${userId}`);
    });
});

app.put('/update/post/:id', authenticateToken, (req, res) => {
    if (!req.user || !req.user.id) {
        // Если пользователя нет или ID отсутствует
        return res.status(401).json({ error: 'Не авторизовано. Будь ласка, увійдіть' });
    }

    const postId = parseInt(req.params.id, 10);
    const { content } = req.body;

    // Перевіряємо, чи пост належить авторизованому користувачу
    const queryCheck = `SELECT * FROM posts WHERE id = ? AND author_id = ?`;
    db.get(queryCheck, [postId, req.user.id], (err, post) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка сервера' });
        }
        if (!post) {
            return res.status(403).json({ error: 'Ви не маєте права редагувати цей пост' });
        }

        // Оновлюємо пост
        const queryUpdate = `UPDATE posts SET body = ? WHERE id = ?`;
        db.run(queryUpdate, [content, postId], function(err) {
            if (err) {
                return res.status(500).json({ error: 'Не вдалося оновити пост' });
            }
            res.json({ success: true });
        });
    });
});

app.get('/delete/post/:id', authenticateToken, (req, res) => {
    const postId = parseInt(req.params.id, 10);

    // Перевіряємо, чи пост належить авторизованому користувачу
    const queryCheck = `SELECT * FROM posts WHERE id = ? AND author_id = ?`;
    db.get(queryCheck, [postId, req.user.id], (err, post) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка сервера' });
        }
        if (!post) {
            return res.status(403).json({ error: 'Ви не маєте права видалити цей пост' });
        }

        // Видаляємо коментарі, пов'язані з постом
        const queryDeleteComments = `DELETE FROM comments WHERE post_id = ?`;
        db.run(queryDeleteComments, [postId], (err) => {
            if (err) {
                return res.status(500).json({ error: 'Не вдалося видалити коментарі' });
            }

            // Видаляємо пост після видалення коментарів
            const queryDeletePost = `DELETE FROM posts WHERE id = ?`;
            db.run(queryDeletePost, [postId], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Не вдалося видалити пост' });
                }
                res.redirect(`/profile/${req.user.id}`); // Повертаємось до профілю після видалення
            });
        });
    });
});


// Добавить комментарий к посту
app.post('/post/:postId/comment', authenticateToken, (req, res) => {
    if (!req.user) {
        return res.status(401).send('Вы должны быть авторизованы для добавления комментария');
    }

    const postId = req.params.postId;
    const commentText = req.body.commentText;
    const userId = req.user.id;

    if (!commentText) {
        return res.status(400).send('Комментарий не может быть пустым');
    }

    // Узнаем ID автора поста, чтобы перенаправить обратно на его профиль
    const getPostAuthorQuery = `SELECT author_id FROM posts WHERE id = ?`;
    db.get(getPostAuthorQuery, [postId], (err, post) => {
        if (err) {
            return res.status(500).send('Ошибка при получении автора поста');
        }

        if (!post) {
            return res.status(404).send('Пост не найден');
        }

        const postAuthorId = post.author_id;

        // Добавляем комментарий
        const sql = `
            INSERT INTO comments (author_id, post_id, comment)
            VALUES (?, ?, ?)
        `;
        const params = [userId, postId, commentText];

        db.run(sql, params, function(err) {
            if (err) {
                return res.status(500).send('Ошибка при добавлении комментария');
            }

            // Перенаправляем на профиль автора поста
            res.redirect('/profile/' + postAuthorId);
        });
    });
});

app.get('/profile/edit/:id', authenticateToken, (req, res) => {
    const params = [req.params.id];
    const query = `SELECT * FROM users WHERE id = ${params}`;
    db.get(query, (err, user) => {
        if (!user) {
            return res.status(400).json({ error: 'Користувача не знайдено' });
        }

        console.log(user);
        res.render('profile_edit', { user });
    })
});

// Обробка POST-запиту для оновлення профілю
app.post('/profile/edit/:id', upload.single('avatar'), (req, res) => {
    console.log(req.body); // Перевірка, чи приходять дані
    console.log(req.file); // Перевірка, чи приходить файл

    const userId = req.params.id;
    const { name, username, description, email, password } = req.body;

    // Перевірка на наявність обов'язкових полів
    if (!name || !username || !description || !email || !password) {
        return res.status(400).json({ error: 'Всі поля повинні бути заповнені' });
    }

    // Перевірка наявності файлу аватара
    let avatarUrl = null;
    if (req.file) {
        const avatarPath = `/img/${req.file.filename}`;
        avatarUrl = avatarPath; // Шлях до файлу для збереження в базі даних
    } else {
        db.get(`SELECT image FROM users WHERE id = ?`, [userId], async (err, img) => {
            if (err || !img) {
                avatarUrl = "/img/1.jpg"; // Якщо зображення не знайдено або сталася помилка
            } else {
                avatarUrl = img.image; // Отримуємо зображення з бази
            }
            const hashedPassword = await bcrypt.hash(password, 10);

            // SQL-запит для оновлення даних користувача
            const query = `UPDATE users SET name = ?, username = ?, image = ?, description = ?, email = ?, password = ? WHERE id = ?`;

            db.run(query, [name, username, avatarUrl, description, email, hashedPassword, userId], function (err) {
                if (err) {
                    console.error('Помилка при оновленні даних:', err.message);
                    return res.status(500).json({ error: 'Помилка сервера' });
                }

                if (this.changes === 0) {
                    return res.status(404).json({ error: 'Користувача не знайдено' });
                }

                // Успішне оновлення даних
                res.json({ success: true, message: 'Дані успішно оновлено' });
            });
        });
        return; // Завершаємо поточний запит, поки не буде виконано оновлення
    }
});

app.get('/profile/:id', authenticateToken, (req, res) => { 
    const userIdFromParams = parseInt(req.params.id, 10); // ID з URL
    const userIdFromToken = req.user ? req.user.id : null; // ID з токена, якщо є
    const user_n = req.user;

    const userQuery = `SELECT * FROM users WHERE id = ?`;
    const postsQuery = `SELECT * FROM posts WHERE author_id = ?`;
    const commentsQuery = `
        SELECT comments.*, users.image, users.name 
        FROM comments
        JOIN users ON comments.author_id = users.id
        WHERE post_id = ?
    `;
    db.get(userQuery, [userIdFromParams], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка бази даних' });
        }

        if (!user) {
            return res.status(400).json({ error: 'Користувача не знайдено' });
        }

        db.all(postsQuery, [userIdFromParams], (err, posts) => {
            if (err) {
                return res.status(500).json({ error: 'Помилка отримання постів' });
            }

            const postsWithComments = [];
            let postsProcessed = 0;

            posts.forEach((post, index) => {
                db.all(commentsQuery, [post.id], (err, comments) => {
                    if (err) {
                        return res.status(500).json({ error: 'Помилка отримання коментарів' });
                    }

                    postsWithComments.push({
                        ...post,
                        comments: comments
                    });

                    postsProcessed++;

                    if (postsProcessed === posts.length) {
                        const isOwner = userIdFromToken === userIdFromParams; // Перевіряємо, чи це профіль власника

                        console.log(posts)
                        res.render('profile', { user, isOwner, user_n, posts: postsWithComments });
                    }
                });
            });

            if (posts.length === 0) {
                res.render('profile', { user, user_n ,isOwner: userIdFromToken === userIdFromParams, posts: [] });
            }
        });
    });
});

app.get('/auth', authenticateToken, (req, res) => {
    res.json({ message: 'Токен вірний!', user: req.user });
});

app.get('/login', (req, res) => res.render('login'));

app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Введіть email і пароль' });
    }

    const query = `SELECT * FROM users WHERE email = ?`;
    db.get(query, [email], async (err, user) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: 'Помилка сервера' });
        }

        if (!user) {
            return res.status(400).json({ error: 'Користувача не знайдено' });
        }

        try {
            const isPasswordCorrect = await bcrypt.compare(password, user.password);

            if (!isPasswordCorrect) {
                return res.status(400).json({ error: 'Невірний пароль' });
            }

            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username },
                secretKey,
                { expiresIn: '1h' }
            );

            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 3600 * 1000 // 1 хвилина
            });

            return res.status(200).json({
                message: 'Логін успішний!',
                id: user.id,
            });
        } catch (error) {
            console.error('Server error:', error);
            return res.status(500).json({ error: 'Помилка сервера' });
        }
    });
});

app.get('/register', (req, res) => res.render('register'));

app.post('/register', (req, res) => {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
        return res.status(400).json({ error: 'Всі поля обов’язкові!' });
    }

    const query = `SELECT * FROM users WHERE email = ? OR username = ?`;
    db.get(query, [email, username], async (err, row) => {
        if (err) {
            return res.status(500).json({ error: 'Помилка сервера' });
        }

        if (row) {
            return res.status(400).json({ error: 'Email або юзернейм вже зайняті' });
        }

        try {
            const hashedPassword = await bcrypt.hash(password, 10); // Хешуємо пароль

            const insertQuery = `
                INSERT INTO users (name, username, image, description, email, password) 
                VALUES (?, ?, ?, ?, ?, ?)
            `;
            db.run(insertQuery, [name, username, "/img/1.jpg", "e", email, hashedPassword], (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Помилка при створенні користувача' });
                }

                return res.status(201).json({ message: 'Реєстрація успішна!' });
            });
        } catch (error) {
            return res.status(500).json({ error: 'Помилка при хешуванні пароля' });
        }
    });
});

app.get('/logout', authenticateToken, (req, res) => {
    res.clearCookie('token'); 
    res.redirect('/login');
});

app.listen(3000, () => {
    console.log('http://127.0.0.1:3000');
});