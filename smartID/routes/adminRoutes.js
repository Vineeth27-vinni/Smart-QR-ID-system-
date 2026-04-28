const express = require("express");
const router  = express.Router();
const path    = require("path");
const nodemailer = require("nodemailer");
const db      = require("../db");
const fs      = require("fs");
const bcrypt  = require("bcryptjs");
const { courseCodes } = require("../utils/courseMapping");
require('dotenv').config();

/* EMAIL CONFIGURATION */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

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

function isSAdmin(req, res, next) {
  if (req.session && req.session.admin && req.session.admin.role === 'sadmin') return next();
  return res.status(403).json({ success: false, message: "Super Admin access required." });
}

/* POST /admin/login*/

router.post("/login", (req, res) => {

  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect("/Admin/admin-login.html?error=1");
  }

  const query = `
    SELECT admin_id, username, role
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
      role:     results[0].role || "admin"
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
  res.json({ 
    username: req.session.admin.username,
    role:     req.session.admin.role
  });
});

/* GET /admin/stats */

router.get("/stats", isAdmin, (req, res) => {

  const year = new Date().getFullYear();

  db.query(`SELECT COUNT(*) AS total FROM students WHERE status = 'approved'`, (err, r1) => {

    if (err) return res.status(500).json({ error: "DB error" });

    db.query(`SELECT COUNT(*) AS total FROM students WHERE admission_year = ? AND status = 'approved'`, [year], (err, r2) => {

      if (err) return res.status(500).json({ error: "DB error" });

      db.query(`SELECT (SELECT COUNT(*) FROM admin_login) + (SELECT COUNT(*) FROM staff) AS total`, (err, r3) => {

        if (err) return res.status(500).json({ error: "DB error" });

        db.query(`SELECT COUNT(*) AS total FROM students WHERE status = 'pending'`, (err, r4) => {

          if (err) return res.status(500).json({ error: "DB error" });

          res.json({
            totalStudents:    r1[0].total,
            thisYear:         r2[0].total,
            totalStaff:       r3[0].total,
            pendingApprovals: r4[0].total
          });

        });

      });

    });

  });

});

/* GET /admin/students */

router.get("/students", isAdmin, (req, res) => {

  db.query(
    `SELECT student_id, first_name, second_name, department, course, mobile_number, admission_year, login_paused, status, email
     FROM students
     ORDER BY serial_no DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(results);
    }
  );

});

/* GET /admin/hostels */
router.get("/hostels", isAdmin, (req, res) => {
  db.query(
    `SELECT h.*, s1.name as warden_name, s2.name as mess_incharge_name 
     FROM hostels h 
     LEFT JOIN staff s1 ON h.warden_id = s1.id 
     LEFT JOIN staff s2 ON h.mess_incharge_id = s2.id`, 
    (err, results) => {
      if (err) return res.status(500).json({ error: "DB error" });
      res.json(results);
    }
  );
});

/* GET /admin/staff-by-role */
router.get("/staff-by-role", isAdmin, (req, res) => {
  const { role } = req.query;
  db.query(`SELECT id, name FROM staff WHERE role = ?`, [role], (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(results);
  });
});

/* POST /admin/add-hostel (Super Admin only) */
router.post("/add-hostel", isSAdmin, (req, res) => {
  const { hostel_name, no_of_rooms, category } = req.body;

  if (!hostel_name) {
    return res.json({ success: false, message: "Hostel name is required." });
  }

  db.query(
    `INSERT INTO hostels (hostel_name, no_of_rooms, vacancies, category) VALUES (?, ?, ?, ?)`,
    [hostel_name, no_of_rooms || 0, no_of_rooms || 0, category || 'Boys'],
    (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") return res.json({ success: false, message: "Hostel already exists." });
        console.error("Add hostel error:", err);
        return res.json({ success: false, message: "Database error." });
      }
      res.json({ success: true, message: "Hostel added successfully!" });
    }
  );
});

/* POST /admin/update-hostel (Super Admin only) */
router.post("/update-hostel", isSAdmin, (req, res) => {
  const { id, no_of_rooms, category, warden_id, mess_incharge_id } = req.body;

  db.query(`SELECT occupied FROM hostels WHERE id = ?`, [id], (err, results) => {
    if (err || results.length === 0) return res.status(500).json({ success: false, message: "Hostel not found" });
    
    const occupied = results[0].occupied;
    const newVacancies = no_of_rooms - occupied;

    if (newVacancies < 0) {
      return res.status(400).json({ success: false, message: "New room count cannot be less than current residents." });
    }

    db.query(
      `UPDATE hostels SET no_of_rooms = ?, vacancies = ?, category = ?, warden_id = ?, mess_incharge_id = ? WHERE id = ?`,
      [no_of_rooms, newVacancies, category, warden_id || null, mess_incharge_id || null, id],
      (err) => {
        if (err) {
          console.error("Update hostel error:", err);
          return res.status(500).json({ success: false, message: "Database error" });
        }
        res.json({ success: true, message: "Hostel updated successfully!" });
      }
    );
  });
});

/* GET /admin/all-staff */
router.get("/all-staff", isAdmin, (req, res) => {
  db.query(`SELECT id, staff_id, name, email, username, role, department, hostel FROM staff`, (err, results) => {
    if (err) return res.status(500).json({ error: "DB error" });
    res.json(results);
  });
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

  const { name, username, password, role, department, hostel, email } = req.body;

  if (!name || !username || !password || !role) {
    return res.json({ success: false, message: "Name, username, password and role are required." });
  }

  const rolePrefixes = {
    "Warden": "WA",
    "Faculty": "FAH",
    "Mess incharge": "MEE",
    "Office admin": "OFA",
    "Librarian": "LIB"
  };

  if (role === "admin") {
    db.query(
      `INSERT INTO admin_login (username, password_hash) VALUES (?, ?)`,
      [username, password],
      (err) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY") return res.json({ success: false, message: "Username already exists." });
          return res.json({ success: false, message: "Database error." });
        }
        res.json({ success: true });
      }
    );
  } else if (rolePrefixes[role]) {
    const prefix = rolePrefixes[role];
    const pattern = `${prefix}%`;
    const saltRounds = 10;

    // Generate Staff ID
    db.query(`SELECT staff_id FROM staff WHERE staff_id LIKE ? ORDER BY staff_id DESC LIMIT 1`, [pattern], async (err, results) => {
      if (err) return res.json({ success: false, message: "Database error." });

      let nextSeq = 1;
      if (results.length > 0) {
        const lastId = results[0].staff_id;
        const lastSeq = parseInt(lastId.replace(prefix, ""));
        if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
      }

      const staffId = `${prefix}${nextSeq.toString().padStart(3, '0')}`;
      
      try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        db.query(
          `INSERT INTO staff (staff_id, name, email, username, password_hash, role, department, hostel) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [staffId, name, email, username, hashedPassword, role, department || null, hostel || null],
          (err) => {
            if (err) {
              if (err.code === "ER_DUP_ENTRY") return res.json({ success: false, message: "Username already exists." });
              console.error("Add staff error:", err);
              return res.json({ success: false, message: "Database error." });
            }
            res.json({ success: true, staff_id: staffId });
          }
        );
      } catch (hashErr) {
        console.error("Hashing error:", hashErr);
        res.json({ success: false, message: "Server error during registration." });
      }
    });
  } else {
    return res.json({ success: false, message: "Invalid role selected." });
  }

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
/* DELETE /admin/student/:student_id */

router.delete("/student/:student_id", isAdmin, (req, res) => {
  const { student_id } = req.params;

  // 1. First, delete from DB
  db.query(`DELETE FROM students WHERE student_id = ?`, [student_id], (err, results) => {
    if (err) {
      console.error("[DELETE ERROR] DB failure:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    // 2. Delete the student's physical folder
    const studentFolder = path.join(__dirname, "../uploads/students/", student_id);
    
    if (fs.existsSync(studentFolder)) {
      try {
        fs.rmSync(studentFolder, { recursive: true, force: true });
        console.log(`[DELETE] Successfully removed folder for: ${student_id}`);
      } catch (fsErr) {
        console.error(`[DELETE] Failed to remove folder for ${student_id}:`, fsErr.message);
        // We don't return error to user because DB delete was successful
      }
    }

    res.json({ success: true, message: "Student and all associated files deleted successfully" });
  });
});

/* POST /admin/student/:student_id/pause */

router.post("/student/:student_id/pause", isAdmin, (req, res) => {
  const { student_id } = req.params;
  const { pause } = req.body; 
  db.query(`UPDATE students SET login_paused = ? WHERE student_id = ?`, [pause ? 1 : 0, student_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (results.affectedRows === 0) return res.status(404).json({ success: false, message: "Student not found" });
    res.json({ success: true, message: `Login ${pause ? 'paused' : 'unpaused'} successfully` });
  });
});

/* POST /admin/student/:student_id/approve */

router.post("/student/:student_id/approve", isAdmin, (req, res) => {
  const { student_id } = req.params;
  console.log(`[APPROVAL] Attempting to approve student: ${student_id}`);

  // 1. Fetch student details (allow 'pending' OR 'approved' if ID is still APP-)
  const checkQuery = `
    SELECT first_name, second_name, email, department, course, admission_year, status 
    FROM students 
    WHERE student_id = ?
  `;

  db.query(checkQuery, [student_id], (err, students) => {
    if (err) {
      console.error("[APPROVAL] DB Error during fetch:", err);
      return res.status(500).json({ success: false, message: "Database error" });
    }

    if (students.length === 0) {
      console.warn(`[APPROVAL] Student not found: ${student_id}`);
      return res.status(404).json({ success: false, message: "Student record not found." });
    }

    const student = students[0];

    // If already approved AND has a formal ID, do nothing
    if (student.status === 'approved' && !student_id.startsWith('APP-')) {
      return res.json({ success: true, message: "Student is already approved with a formal ID." });
    }

    // Generate Formal ID
    const yearCode = (student.admission_year || new Date().getFullYear()).toString().slice(-2);
    const courseCode = courseCodes[student.course] || "GEN";
    const pattern = `${yearCode}${courseCode}%`;

    console.log(`[APPROVAL] Generating ID for ${student.course} (${courseCode}), Year: ${yearCode}`);

    // 2. Find the next sequence number
    db.query(`SELECT student_id FROM students WHERE student_id LIKE ? AND student_id NOT LIKE 'APP-%' ORDER BY student_id DESC LIMIT 1`, [pattern], (err, results) => {
      if (err) {
        console.error("[APPROVAL] DB Error during sequence check:", err);
        return res.status(500).json({ success: false, message: "Database error" });
      }

      let nextSeq = 1;
      if (results.length > 0) {
        const lastId = results[0].student_id;
        // Extract the last 3 digits
        const lastSeqStr = lastId.slice(-3);
        const lastSeq = parseInt(lastSeqStr);
        if (!isNaN(lastSeq)) {
          nextSeq = lastSeq + 1;
        }
      }

      const newStudentId = `${yearCode}${courseCode}${nextSeq.toString().padStart(3, '0')}`;
      console.log(`[APPROVAL] Final ID Assigned: ${newStudentId}`);

      // 3. Start transaction
      db.beginTransaction((err) => {
        if (err) {
          console.error("[APPROVAL] Transaction error:", err);
          return res.status(500).json({ success: false, message: "Internal server error" });
        }

        // Update ID and Status
        const updateQuery = `UPDATE students SET student_id = ?, status = 'approved' WHERE student_id = ?`;
        db.query(updateQuery, [newStudentId, student_id], (err) => {
          if (err) {
            return db.rollback(() => {
              console.error("[APPROVAL] Update query failed:", err);
              res.status(500).json({ success: false, message: "Failed to update student ID. It might already exist." });
            });
          }

          // 4. Handle Folder Renaming
          const oldFolder = path.join(__dirname, "../uploads/students/", student_id);
          const newFolder = path.join(__dirname, "../uploads/students/", newStudentId);

          if (fs.existsSync(oldFolder)) {
            try {
              fs.renameSync(oldFolder, newFolder);
              console.log(`[APPROVAL] Renamed folder for ${newStudentId}`);
              
              // Update file paths in DB
              const newPhoto = `uploads/students/${newStudentId}/photo.jpg`;
              const newSign  = `uploads/students/${newStudentId}/signature.jpg`;
              db.query(`UPDATE students SET photo = ?, signature = ? WHERE student_id = ?`, [newPhoto, newSign, newStudentId]);
            } catch (fsErr) {
              console.error("[APPROVAL] Folder rename warning:", fsErr.message);
            }
          }

          db.commit((err) => {
            if (err) {
              return db.rollback(() => {
                console.error("[APPROVAL] Commit failed:", err);
                res.status(500).json({ success: false, message: "Failed to finalize approval." });
              });
            }

            console.log(`[APPROVAL] Success! ${student_id} -> ${newStudentId}`);

            // 5. Send Notification Email
            if (student.email) {
              const mailOptions = {
                from: process.env.EMAIL_USER,
                to: student.email,
                subject: 'SmartID Application Approved',
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
                    <h2 style="color: #28a745; text-align: center;">Application Approved!</h2>
                    <p>Hello <strong>${student.first_name} ${student.second_name}</strong>,</p>
                    <p>Your application for SmartID has been approved.</p>
                    <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                      <p style="margin: 0; color: #666;">Your Permanent Student ID is:</p>
                      <h2 style="margin: 10px 0; color: #7b1e2b; letter-spacing: 2px;">${newStudentId}</h2>
                    </div>
                    <p>You can now log in at the student portal using this ID.</p>
                    <p>Best regards,<br>SmartID Team</p>
                  </div>
                `
              };

              transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                  console.error(`[EMAIL ERROR] Failed for ${student.email}:`, error.message);
                  if (error.code === 'EAUTH') {
                    console.error("[EMAIL ERROR] Authentication failed. Please check EMAIL_PASS in .env.");
                  }
                } else {
                  console.log(`[EMAIL SUCCESS] Sent to ${student.email}:`, info.response);
                }
              });
            } else {
              console.warn(`[APPROVAL] No email found for student ${newStudentId}, skipping notification.`);
            }

            res.json({ 
              success: true, 
              message: `Approved! New ID: ${newStudentId}`,
              new_id: newStudentId 
            });
          });
        });
      });
    });
  });
});

/* POST /admin/student/:student_id/reject */

router.post("/student/:student_id/reject", isAdmin, (req, res) => {
  const { student_id } = req.params;
  
  db.query(`UPDATE students SET status = 'rejected' WHERE student_id = ? AND status = 'pending'`, [student_id], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Database error" });
    if (results.affectedRows === 0) return res.status(404).json({ success: false, message: "Student not found or already approved/rejected" });
    
    // Fetch student email to notify them
    db.query(`SELECT email, first_name, second_name FROM students WHERE student_id = ?`, [student_id], (err, students) => {
      if (!err && students.length > 0 && students[0].email) {
        const student = students[0];
        const mailOptions = {
          from: process.env.EMAIL_USER || 'your-email@gmail.com',
          to: student.email,
          subject: 'SmartID Application Rejected',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc3545;">Application Rejected</h2>
              <p>Hello ${student.first_name} ${student.second_name},</p>
              <p>Unfortunately, your application has been rejected by the administrator.</p>
              <p>If you believe this is an error, please contact the administration.</p>
              <br>
              <p>Best regards,<br>SmartID Team</p>
            </div>
          `
        };
        transporter.sendMail(mailOptions, (error, info) => {
          if (error) console.error("Failed to send rejection email", error);
        });
      }
      res.json({ success: true, message: "Student rejected successfully." });
    });
  });
});

module.exports = router;