const express = require("express");
const path = require("path");
const session = require("express-session");
require("dotenv").config();

const app = express();

/* ROUTES */
const studentRoutes = require("./routes/studentRoutes");
const adminRoutes = require("./routes/adminRoutes");
const staffRoutes = require("./routes/staffRoutes");
const wardenRoutes = require("./routes/wardenRoutes");
const messRoutes = require("./routes/messRoutes");


/* MIDDLEWARE */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* SESSION */
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60,
    httpOnly: true,  // Prevents JavaScript access to session cookie
    secure: false,   // Set to true if using HTTPS
    sameSite: 'strict'  // CSRF protection
  }
}));

/* CACHE CONTROL MIDDLEWARE for admin routes */
app.use("/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/staff", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

/* STATIC FILES */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* MOUNT ROUTES */
app.use("/student", studentRoutes);
app.use("/admin", adminRoutes);
app.use("/staff", staffRoutes);
app.use("/staff/warden", wardenRoutes);
app.use("/staff/mess", messRoutes);

/* Dashboard Redirection Routes */
app.get("/staff/mess/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "public/Staff/mess-dashboard.html"));
});


/* HOME */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

/* START */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

