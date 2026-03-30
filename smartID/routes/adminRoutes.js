const express = require("express");
const router  = express.Router();
const path    = require("path");
const db      = require("../db");

/* GET /admin/login page */
router.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Admin/admin-login.html"));
});

/* MIDDLEWARE — protect admin routes*/

function isAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.redirect("/Admin/admin-login.html?error=3");
}

/* POST /admin/login*/

router.post("/login", (req, res) => {

  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect("/Admin/admin-login.html?error=1");
  }

  const query = `
    SELECT admin_id, username
    FROM admin_login
    WHERE username = ? AND password_hash = ?
  `;

  db.query(query, [username, password], (err, results) => {

    if (err) {
      console.error("Admin login DB error:", err);
      return res.redirect("/Admin/admin-login.html?error=2");
    }

    if (results.length === 0) {
      return res.redirect("/Admin/admin-login.html?error=1");
    }

    req.session.admin = {
      admin_id: results[0].admin_id,
      username: results[0].username,
      role:     "admin"
    };

    console.log(`Admin logged in: ${results[0].username}`);
    return res.redirect("/admin/dashboard");

  });

});

/*GET /admin/dashboard  (protected)*/

router.get("/dashboard", isAdmin, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Admin/admin-dashboard.html"));
});

/* GET /admin/me*/

router.get("/me", isAdmin, (req, res) => {
  res.json({ username: req.session.admin.username });
});

/* GET /admin/stats */

router.get("/stats", isAdmin, (req, res) => {

  const year = new Date().getFullYear();

  db.query(`SELECT COUNT(*) AS total FROM students`, (err, r1) => {

    if (err) return res.status(500).json({ error: "DB error" });

    db.query(`SELECT COUNT(*) AS total FROM students WHERE admission_year = ?`, [year], (err, r2) => {

      if (err) return res.status(500).json({ error: "DB error" });

      db.query(`SELECT COUNT(*) AS total FROM admin_login`, (err, r3) => {

        if (err) return res.status(500).json({ error: "DB error" });

        db.query(`
          SELECT COUNT(*) AS total
          FROM students s
          LEFT JOIN student_login sl ON s.student_id = sl.student_id
          WHERE sl.password_hash IS NULL
        `, (err, r4) => {

          if (err) return res.status(500).json({ error: "DB error" });

          res.json({
            totalStudents:   r1[0].total,
            thisYear:        r2[0].total,
            totalStaff:      r3[0].total,
            pendingPassword: r4[0].total
          });

        });

      });

    });

  });

});

/* GET /admin/students */

router.get("/students", isAdmin, (req, res) => {

  db.query(
    `SELECT student_id, first_name, second_name, department, course, mobile_number, admission_year
     FROM students
     ORDER BY serial_no DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(results);
    }
  );

});

/* GET /admin/student/:student_id */

router.get("/student/:student_id", isAdmin, (req, res) => {

  const { student_id } = req.params;

  db.query(
    `SELECT * FROM students WHERE student_id = ?`,
    [student_id],
    (err, results) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (results.length === 0) return res.status(404).json({ error: "Student not found" });
      res.json(results[0]);
    }
  );

});

/* POST /admin/add-staff */

router.post("/add-staff", isAdmin, (req, res) => {

  const { name, username, password, role, department, email } = req.body;

  if (!name || !username || !password || !role) {
    return res.json({ success: false, message: "Name, username, password and role are required." });
  }

  if (role !== "admin" && role !== "staff") {
    return res.json({ success: false, message: "Invalid role selected." });
  }

  const table = role === "admin" ? "admin_login" : "staff_login";

  db.query(
    `INSERT INTO ${table} (username, password_hash) VALUES (?, ?)`,
    [username, password],
    (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.json({ success: false, message: "Username already exists." });
        }
        console.error("Add staff error:", err);
        return res.json({ success: false, message: "Database error." });
      }
      res.json({ success: true });
    }
  );

});

/* GET /admin/logout*/

router.get("/logout", (req, res) => {

  const username = req.session.admin ? req.session.admin.username : "unknown";

  // Set cache-control headers BEFORE destroying session
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  req.session.destroy((err) => {
    if (err) console.error("Admin logout error:", err);
    console.log(`Admin logged out: ${username}`);
    res.redirect("/Admin/admin-login.html");
  });

});

module.exports = router;