const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const path = require("path");

const app = express();
const db = new Database("db.sqlite");

const SECRET = "4def225f974d255b34dd4a20ad92b3e0b2fae5377c87d72d60c66b449d7986f1ace6c051dc917c656102da3a8efaa1866cfaea316e4f42188bacc7347d6045f2";

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE,
  password TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  user INTEGER,
  status TEXT DEFAULT 'pending'
);
`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend-public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});
app.use(cors({ origin: "*" }));

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests, slow down" }
});

const taskLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many task requests" }
});

const authSchema = z.object({
  login: z.string().min(3).max(30),
  password: z.string().min(4).max(100)
});

const taskSchema = z.object({
  name: z.string().min(1).max(200)
});

const taskUpdateSchema = z.object({
  status: z.enum(["done", "pending"])
});

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) return res.status(401).json({ error: "no token" });

  try {
    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, SECRET);

    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "invalid token" });
  }
}

app.post("/register", authLimiter, (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid input" });
  }

  const { login, password } = parsed.data;

  try {
    const hash = bcrypt.hashSync(password, 10);

    const info = db.prepare(
      "INSERT INTO users (login, password) VALUES (?, ?)"
    ).run(login, hash);

    const token = jwt.sign({ id: info.lastInsertRowid }, SECRET);

    res.json({
      token,
      user: { id: info.lastInsertRowid, login }
    });

  } catch {
    res.status(400).json({ error: "user exists" });
  }
});

app.post("/login", authLimiter, (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid input" });
  }

  const { login, password } = parsed.data;

  const user = db.prepare(
    "SELECT * FROM users WHERE login = ?"
  ).get(login);

  if (!user) return res.status(400).json({ error: "not found" });

  const ok = bcrypt.compareSync(password, user.password);
  if (!ok) return res.status(400).json({ error: "wrong password" });

  const token = jwt.sign({ id: user.id }, SECRET);

  res.json({
    token,
    user: { id: user.id, login: user.login }
  });
});

app.get("/me", auth, (req, res) => {
  const user = db.prepare(
    "SELECT id, login FROM users WHERE id = ?"
  ).get(req.userId);

  res.json(user);
});

app.get("/tasks", auth, taskLimiter, (req, res) => {
  const tasks = db.prepare(
    "SELECT * FROM tasks WHERE user = ?"
  ).all(req.userId);

  res.json(tasks);
});

app.post("/tasks", auth, taskLimiter, (req, res) => {
  const parsed = taskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid task name" });
  }

  const { name } = parsed.data;

  const info = db.prepare(
    "INSERT INTO tasks (name, user, status) VALUES (?, ?, 'pending')"
  ).run(name, req.userId);

  res.json({ id: info.lastInsertRowid });
});

app.patch("/tasks/:id", auth, taskLimiter, (req, res) => {
  const parsed = taskUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid status" });
  }

  db.prepare(
    "UPDATE tasks SET status = ? WHERE id = ? AND user = ?"
  ).run(parsed.data.status, req.params.id, req.userId);

  res.json({ ok: true });
});

app.delete("/tasks/:id", auth, taskLimiter, (req, res) => {
  db.prepare(
    "DELETE FROM tasks WHERE id = ? AND user = ?"
  ).run(req.params.id, req.userId);

  res.json({ ok: true });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
