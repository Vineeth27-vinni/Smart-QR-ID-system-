const express = require("express");
const router  = express.Router();
const path    = require("path");
const db      = require("../db");
const bcrypt  = require("bcryptjs");

/* MIDDLEWARE — protect staff routes */
function isStaff(req, res, next) {
  if (req.session && req.session.staff) return next();
  return res.redirect("/Staff/warden-login.html?error=3");
}

/* GET /staff/login page */
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/Staff/warden-login.html"));
});

/* POST /staff/login */
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect("/Staff/warden-login.html?error=1");
  }

  // Find staff member by username or staff_id
  const query = `
    SELECT staff_id, name, email, username, password_hash, role, hostel
    FROM staff
    WHERE username = ? OR staff_id = ?
  `;

  db.query(query, [username, username], async (err, results) => {
    if (err) {
      console.error("[STAFF LOGIN ERROR] DB failure:", err);
      return res.redirect("/Staff/warden-login.html?error=2");
    }

    if (results.length === 0) {
      console.warn(`[STAFF LOGIN FAILED] Invalid credentials for: ${username}`);
      return res.redirect("/Staff/warden-login.html?error=1");
    }

    const staff = results[0];

    try {
      const passwordMatch = await bcrypt.compare(password, staff.password_hash);
      
      if (!passwordMatch) {
        console.warn(`[STAFF LOGIN FAILED] Wrong password for: ${username}`);
        return res.redirect("/Staff/warden-login.html?error=1");
      }

      // Create session
      req.session.staff = {
        staff_id: staff.staff_id,
        name:     staff.name,
        username: staff.username,
        role:     staff.role,
        hostel:   staff.hostel
      };

      console.log(`Staff logged in: ${staff.username} (${staff.role})`);

      // Redirect based on role
      if (staff.role === 'Warden') {
        return res.redirect("/staff/warden/dashboard");
      } else if (staff.role === 'Mess incharge') {
        return res.redirect("/staff/mess/dashboard");
      } else if (staff.role === 'Library staff') {
        return res.redirect("/staff/library/dashboard");
      } else {
        return res.redirect("/Staff/dashboard.html");
      }
    } catch (compareErr) {
      console.error("[STAFF LOGIN ERROR] Comparison failed:", compareErr);
      return res.redirect("/Staff/warden-login.html?error=2");
    }
  });
});

/* Dashboard Redirection Routes */
router.get("/warden/dashboard", isStaff, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/Staff/warden-dashboard.html"));
});

/* GET /staff/me */
router.get("/me", (req, res) => {
  if (req.session && req.session.staff) {
    res.json(req.session.staff);
  } else {
    res.status(401).json({ error: "Not logged in" });
  }
});

/* GET /staff/logout */
router.get("/logout", (req, res) => {
  const username = req.session.staff ? req.session.staff.username : "unknown";
  req.session.destroy((err) => {
    if (err) console.error("Staff logout error:", err);
    console.log(`Staff logged out: ${username}`);
    res.redirect("/");
  });
});

module.exports = router;
