const express = require("express");
const router  = express.Router();
const path    = require("path");
const multer  = require("multer");
const fs      = require("fs");
const QRCode  = require("qrcode");
const crypto  = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt  = require("bcryptjs");
const db      = require("../db");
require('dotenv').config();


/* EMAIL CONFIGURATION */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Verify connection configuration
transporter.verify(function(error, success) {
  if (error) {
    console.error("[EMAIL CONFIG] Verification failed:", error.message);
    console.warn("[EMAIL CONFIG] Emails will NOT work until EMAIL_USER and EMAIL_PASS are correct in .env");
  } else {
    console.log("[EMAIL CONFIG] Server is ready to take our messages");
  }
});

/* ENSURE FOLDERS EXIST */

["uploads", "uploads/temp", "uploads/students"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});


/* MULTER */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/temp"),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* DELETE FILE HELPER */

const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

/* GET COURSES BY DEPARTMENT */

router.get("/get-courses", (req, res) => {
  const courses = {
    "School of Computer and Information Science": [
      "I.Mtech CSE",
      "M.Tech Computer Science-AI",
      "M.Tech Computer Science-Data Science",
      "M.Tech Computer Science",
      "PHD Computer Science"
    ],
    "School of Physics": [
      "B.Sc Physics",
      "M.Sc Physics",
      "PHD Physics"
    ],
    "School of Chemistry": [
      "B.Sc Chemistry",
      "M.Sc Chemistry",
      "PHD Chemistry"
    ],
    "School of Mathematics": [
      "B.Sc Mathematics",
      "M.Sc Mathematics",
      "PHD Mathematics"
    ],
    "School of Life Sciences": [
      "B.Sc Life Sciences",
      "M.Sc Life Sciences",
      "PHD Life Sciences"
    ],
    "School of Management": [
      "MBA"
    ]
  };
  res.json(courses);
});

/* COURSE CODE MAPPING */

const { courseCodes } = require("../utils/courseMapping");



/* GET REGISTRATION PAGE */
router.get("/registration", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Registration/student-registration.html"));
});

/* VALIDATION */

function validateRegistration(body) {
  const errors = [];
  if (!body.first_name  || body.first_name.trim()  === "") errors.push("First name required");
  if (!body.second_name || body.second_name.trim() === "") errors.push("Last name required");
  if (!body.father_name || body.father_name.trim() === "") errors.push("Father name required");
  if (!body.mother_name || body.mother_name.trim() === "") errors.push("Mother name required");
  if (!body.gender)                                         errors.push("Gender required");
  if (!body.department)                                     errors.push("Department required");
  if (!body.course)                                         errors.push("Course required");
  if (!/^[6-9][0-9]{9}$/.test(body.mobile_number))         errors.push("Invalid mobile number");
  if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) errors.push("Invalid email");
  if (body.permanent_pincode     && !/^\d{6}$/.test(body.permanent_pincode))     errors.push("Invalid permanent pincode");
  if (body.correspondence_pincode && !/^\d{6}$/.test(body.correspondence_pincode)) errors.push("Invalid correspondence pincode");
  return errors;
};

router.post("/register",

  upload.fields([
    { name: "photo", maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),
  (req, res) => {

    try {

      const errors = validateRegistration(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors.join(", ") });
      }

      const {
        first_name, second_name, father_name, mother_name,
        gender, date_of_birth, mobile_number, email,
        department, course,
        permanent_hno, permanent_street, permanent_city,
        permanent_district, permanent_state, permanent_pincode,
        correspondence_hno, correspondence_street, correspondence_city,
        correspondence_district, correspondence_state, correspondence_pincode
      } = req.body;

      /* ================= CHECK DUPLICATES ================= */

      db.query(
        "SELECT email, mobile_number FROM students WHERE email = ? OR mobile_number = ?",
        [email, mobile_number],
        (err, existing) => {

          if (err) return res.status(500).json({ success: false, message: "Database Error" });

          if (existing.length > 0) {
            if (existing[0].email === email)
              return res.status(400).json({ success: false, message: "Email already registered" });

            if (existing[0].mobile_number === mobile_number)
              return res.status(400).json({ success: false, message: "Mobile already registered" });
          }

          /* ================= GENERATE APPLICATION ID ================= */

          const studentId = `APP-${Date.now()}`; // Temporary ID until approved
          const admission_year = new Date().getFullYear();

              /* ================= INSERT ================= */

              db.query(`
                INSERT INTO students (
                  student_id, first_name, second_name, father_name, mother_name,
                  gender, date_of_birth, mobile_number, email, department, course,
                  permanent_hno, permanent_street, permanent_city, permanent_district,
                  permanent_state, permanent_pincode,
                  correspondence_hno, correspondence_street, correspondence_city,
                  correspondence_district, correspondence_state, correspondence_pincode,
                  admission_year
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              `, [
                studentId, first_name, second_name, father_name, mother_name,
                gender, date_of_birth, mobile_number, email, department, course,
                permanent_hno, permanent_street, permanent_city, permanent_district,
                permanent_state, permanent_pincode,
                correspondence_hno, correspondence_street, correspondence_city,
                correspondence_district, correspondence_state, correspondence_pincode,
                admission_year
              ], (err) => {

                if (err) {
                  console.error("Insert error:", err);
                  return res.status(500).json({ success: false, message: "Insert failed" });
                }

                /* ================= FILE HANDLING ================= */

                const folder = `uploads/students/${studentId}`;
                fs.mkdirSync(folder, { recursive: true });

                let photoPath = null;
                let signPath  = null;

                if (req.files?.photo?.[0]) {
                  const temp = req.files.photo[0].path;
                  if (fs.existsSync(temp)) {
                    photoPath = `${folder}/photo.jpg`;
                    fs.renameSync(temp, photoPath);
                  }
                }

                if (req.files?.signature?.[0]) {
                  const temp = req.files.signature[0].path;
                  if (fs.existsSync(temp)) {
                    signPath = `${folder}/signature.jpg`;
                    fs.renameSync(temp, signPath);
                  }
                }

                /* ================= UPDATE FILE PATHS ================= */

                db.query(
                  `UPDATE students SET photo=?, signature=? WHERE student_id=?`,
                  [photoPath, signPath, studentId]
                );

                /* ================= RESPONSE ================= */

                return res.json({
                  success: true,
                  student_id: studentId,
                  message: "Registration successful. Please wait for admin approval. You will receive an email once approved."
                });

              });
        }
      );

    } catch (err) {
      console.error("Server error:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

/*POST /students/send-otp */

router.post("/send-otp", (req, res) => {

  const { student_id, name, department, course } = req.body;

  if (!student_id || !name || !department || !course) {
    return res.status(400).send("All fields are required");
  }

  const query = `
    SELECT student_id, first_name, second_name, email, status
    FROM students
    WHERE student_id = ?
      AND LOWER(REPLACE(CONCAT(first_name, second_name), ' ', '')) = LOWER(REPLACE(?, ' ', ''))
      AND department = ?
      AND course = ?
  `;

  db.query(query, [student_id, name, department, course], (err, results) => {

    if (err) return res.status(500).send("Database Error");
    if (results.length === 0) return res.status(404).send("Student not found. Please check your details.");

    const student = results[0];
    if (student.status === 'pending') {
      return res.status(403).send("Your application is pending admin approval.");
    }
    if (student.status === 'rejected') {
      return res.status(403).send("Your application was rejected.");
    }

    db.query(`SELECT password_hash FROM student_login WHERE student_id = ?`, [student_id], (err, passResult) => {

      if (err) return res.status(500).send("Database Error");

      if (passResult.length > 0 && passResult[0].password_hash) {
        return res.status(400).send("You already have an account. Please use the login page.");
      }

      const rateQuery = `
        SELECT
          COUNT(*) AS requests_last_24h,
          MAX(requested_at) AS last_requested_at
        FROM otp_requests
        WHERE student_id = ?
          AND requested_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      `;

      db.query(rateQuery, [student_id], (err, rateResult) => {
        if (err) {
          console.error("Rate query error:", err);
          return res.status(500).send("Database Error");
        }

        const requestsLast24h = rateResult[0].requests_last_24h || 0;
        const lastRequestedAt = rateResult[0].last_requested_at;

        if (requestsLast24h >= 5) {
          return res.status(429).send("Maximum of 5 OTP requests in 24 hours exceeded. Please try again later.");
        }

        if (lastRequestedAt) {
          const lastRequestTime = new Date(lastRequestedAt).getTime();
          const now = Date.now();
          if (now - lastRequestTime < 30 * 1000) {
            return res.status(429).send("Please wait 30 seconds before requesting another OTP.");
          }
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

        db.query(
          `INSERT INTO otp_requests (student_id, otp_hash, requested_at, expires_at, request_ip)
           VALUES (?, ?, ?, ?, ?)`,
          [student_id, otpHash, new Date(), expiresAt, req.ip],
          (err) => {
            if (err) {
              console.error("Insert OTP error:", err);
              return res.status(500).send("Database Error");
            }

            req.session.pendingStudent = student_id;

            const mailOptions = {
              from: process.env.EMAIL_USER || 'your-email@gmail.com',
              to: results[0].email,
              subject: 'SmartID Password Setup - OTP Verification',
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #7b1e2b;">SmartID Password Setup</h2>
                  <p>Hello ${results[0].first_name} ${results[0].second_name},</p>
                  <p>Your OTP for password setup is: <strong style="font-size: 24px; color: #7b1e2b;">${otp}</strong></p>
                  <p>This OTP is valid for 5 minutes.</p>
                  <p>If you didn't request this, please ignore this email.</p>
                  <br>
                  <p>Best regards,<br>SmartID Team</p>
                </div>
              `
            };

            transporter.sendMail(mailOptions, (error, info) => {
              if (error) {
                console.error('Email send error:', error);
                return res.status(500).send("Failed to send OTP email. Please try again.");
              }
              console.log('OTP email sent:', info.response);
              res.send(`OTP sent successfully to your registered email! Valid for 5 minutes.`);
            });
          }
        );
      });
    });
  });
});

/* POST /students/verify-otp*/

router.post("/verify-otp", (req, res) => {

  const { otp } = req.body;
  const student_id = req.session.pendingStudent;

  if (!otp) return res.status(400).send("OTP is required");
  if (!student_id) return res.status(400).send("No OTP requested. Please request a new OTP.");

  const selectQuery = `
    SELECT id, otp_hash, expires_at, status
    FROM otp_requests
    WHERE student_id = ?
      AND status = 'pending'
      AND expires_at >= NOW()
    ORDER BY requested_at DESC
    LIMIT 1
  `;

  db.query(selectQuery, [student_id], (err, rows) => {
    if (err) {
      console.error("OTP select error:", err);
      return res.status(500).send("Database Error");
    }

    if (rows.length === 0) {
      return res.status(400).send("No valid OTP found or OTP expired. Please request a new OTP.");
    }

    const otpRecord = rows[0];
    const submittedHash = crypto.createHash('sha256').update(otp.trim()).digest('hex');

    if (submittedHash !== otpRecord.otp_hash) {
      return res.status(400).send("Invalid OTP. Please try again.");
    }

    db.query(
      `UPDATE otp_requests SET status = 'verified', verified_at = NOW() WHERE id = ?`,[otpRecord.id],
      (err) => {
        if (err) {
          console.error("OTP verify update error:", err);
          return res.status(500).send("Database Error");
        }

        req.session.otpVerified = true;
        res.send("OTP Verified");
      }
    );
  });
});

/*POST /students/set-password*/

router.post("/set-password", async (req, res) => {

  const { password } = req.body;

  if (!req.session.otpVerified || !req.session.pendingStudent) {
    return res.status(403).send("Unauthorized. Please verify OTP first.");
  }

  if (!password || password.length < 6) {
    return res.status(400).send("Password must be at least 6 characters");
  }

  try {
    const student_id = req.session.pendingStudent;
    
    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    db.query(
      `INSERT INTO student_login (student_id, password_hash)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE password_hash = ?`,
      [student_id, hashedPassword, hashedPassword],
      (err) => {
        if (err) {
          console.error("Set password error:", err);
          return res.status(500).send("Database Error");
        }
        delete req.session.otpVerified;
        delete req.session.pendingStudent;
        res.send("Password set successfully! You can now login.");
      }
    );
  } catch (error) {
    console.error("Password hashing error:", error);
    res.status(500).send("Error setting password");
  }

});

/* GET /student/login */
router.get("/login", (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Student/student-login.html"));
});

function isStudent(req, res, next) {
  if (req.session && req.session.student) return next();
  return res.redirect("/student/login");
}

/* POST /student/login */
router.post("/login", (req, res) => {
  const { student_id, password } = req.body;

  if (!student_id || !password) {
    return res.redirect("/student/login?error=1");
  }

  const query = `
    SELECT s.student_id, s.first_name, s.second_name, s.department, s.course,
           s.mobile_number, s.email, s.login_paused, s.status, s.photo, sl.password_hash
    FROM students s
    LEFT JOIN student_login sl ON s.student_id = sl.student_id
    WHERE s.student_id = ?
  `;

  db.query(query, [student_id], async (err, results) => {
    if (err) {
      console.error("Student login DB error:", err);
      return res.redirect("/student/login?error=2");
    }

    if (results.length === 0 || !results[0].password_hash) {
      return res.redirect("/student/login?error=1");
    }

    const student = results[0];

    if (student.status !== 'approved') {
      return res.redirect("/student/login?error=5"); // not approved
    }

    if (student.login_paused) {
      return res.redirect("/student/login?error=4"); // using 4 for paused account
    }

    const passwordMatch = await bcrypt.compare(password, student.password_hash);

    if (!passwordMatch) {
      return res.redirect("/student/login?error=1");
    }

    req.session.student = {
      student_id:   student.student_id,
      first_name:   student.first_name,
      second_name:  student.second_name,
      department:   student.department,
      course:       student.course,
      mobile_number: student.mobile_number,
      email:        student.email,
      photo:        student.photo
    };

    return res.redirect("/student/dashboard");
  });
});

/* GET /student/academics */
router.get("/academics", isStudent, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Student/academics.html"));
});

/* GET /student/dashboard */
router.get("/dashboard", isStudent, (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(__dirname, "../public/Student/student-dashboard.html"));
});

/* GET /student/me */
router.get("/me", isStudent, (req, res) => {
  res.json({ student: req.session.student });
});

/* GET /student/logout */
router.get("/logout", (req, res) => {
  const studentId = req.session.student ? req.session.student.student_id : "unknown";

  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  req.session.destroy((err) => {
    if (err) console.error("Student logout error:", err);
    console.log(`Student logged out: ${studentId}`);
    res.clearCookie("connect.sid");
    res.redirect("/student/login");
  });
});

/* GET /student/academics/data */
router.get("/academics/data", isStudent, (req, res) => {
  const student_id = req.session.student.student_id;

  const queries = {
    semesters: `SELECT * FROM academic_semesters WHERE student_id = ? ORDER BY semester_number DESC`,
    enrollment: `
      SELECT e.*, c.course_name, c.course_type, c.credits, a.classes_attended, a.total_classes
      FROM course_enrollment e
      JOIN academic_courses c ON e.course_code = c.course_code
      LEFT JOIN attendance_records a ON e.student_id = a.student_id AND e.course_code = a.course_code
      WHERE e.student_id = ?
    `,
    results: `
      SELECT r.*, c.course_name, c.credits
      FROM academic_results r
      JOIN academic_courses c ON r.course_code = c.course_code
      WHERE r.student_id = ?
    `
  };

  db.query(queries.semesters, [student_id], (err, semesters) => {
    if (err) return res.status(500).json({ error: "DB Error (Semesters)" });

    db.query(queries.enrollment, [student_id], (err, enrollment) => {
      if (err) return res.status(500).json({ error: "DB Error (Enrollment)" });

      db.query(queries.results, [student_id], (err, results) => {
        if (err) return res.status(500).json({ error: "DB Error (Results)" });

        res.json({
          semesters,
          enrollment,
          results
        });
      });
    });
  });
});

module.exports = router;