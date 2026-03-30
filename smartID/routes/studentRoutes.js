const express = require("express");
const router  = express.Router();
const multer  = require("multer");
const fs      = require("fs");
const QRCode  = require("qrcode");
const crypto  = require("crypto");
const nodemailer = require("nodemailer");
const db      = require("../db");

/* EMAIL CONFIGURATION */
const transporter = nodemailer.createTransporter({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

/* ENSURE FOLDERS EXIST */

["uploads", "uploads/temp", "uploads/students"].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/* COURSE CODE MAPPING */

const courseCodes = {
  "I.Mtech CSE":                          "MCCE",
  "M.Tech Computer Science-AI":           "MTAI",
  "M.Tech Computer Science-Data Science": "MTDS",
  "M.Tech Computer Science":              "MTCSE",
  "PHD Computer Science":                 "PCSE",
  "B.Sc Physics":                         "BPHY",
  "M.Sc Physics":                         "MPHY",
  "PHD Physics":                          "PPHY",
  "B.Sc Chemistry":                       "BCHE",
  "M.Sc Chemistry":                       "MCHE",
  "PHD Chemistry":                        "PCHE",
  "B.Sc Mathematics":                     "BMAT",
  "M.Sc Mathematics":                     "MMAT",
  "PHD Mathematics":                      "PMAT",
  "B.Sc Life Sciences":                   "BLIF",
  "M.Sc Life Sciences":                   "MLIF",
  "PHD Life Sciences":                    "PLIF",
  "MBA":                                  "MBA"
};

/* MULTER */

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/temp"),
  filename:    (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

/* DELETE FILE HELPER */

const deleteFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

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
}

/* POST /students/register*/

router.post("/register",

  upload.fields([
    { name: "photo",     maxCount: 1 },
    { name: "signature", maxCount: 1 }
  ]),

  async (req, res) => {

  try {

    const errors = validateRegistration(req.body);
    if (errors.length > 0) {
      if (req.files["photo"])     deleteFile(req.files["photo"][0].path);
      if (req.files["signature"]) deleteFile(req.files["signature"][0].path);
      return res.status(400).send("Validation Error: " + errors.join(", "));
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

    const courseCode = courseCodes[course] || "GEN";
    const year       = new Date().getFullYear().toString().slice(-2);

    const countQuery = `
      SELECT COUNT(*) AS total FROM students
      WHERE course = ? AND admission_year = YEAR(CURDATE())
    `;

    db.query(countQuery, [course], (err, result) => {

      if (err) {
        console.error("Count query error:", err);
        if (req.files["photo"])     deleteFile(req.files["photo"][0].path);
        if (req.files["signature"]) deleteFile(req.files["signature"][0].path);
        return res.status(500).send("Error generating student ID");
      }

      const serial          = result[0].total + 1;
      const serialFormatted = String(serial).padStart(3, "0");
      const studentId       = `${year}${courseCode}${serialFormatted}`;
      const admission_year  = new Date().getFullYear();

      console.log("Generated Student ID:", studentId);

      const insertQuery = `
        INSERT INTO students (
          student_id, first_name, second_name, father_name, mother_name,
          gender, date_of_birth, mobile_number, email, department, course,
          permanent_hno, permanent_street, permanent_city, permanent_district,
          permanent_state, permanent_pincode,
          correspondence_hno, correspondence_street, correspondence_city,
          correspondence_district, correspondence_state, correspondence_pincode,
          admission_year
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `;

      db.query(insertQuery, [
        studentId, first_name, second_name, father_name, mother_name,
        gender, date_of_birth, mobile_number, email, department, course,
        permanent_hno, permanent_street, permanent_city, permanent_district,
        permanent_state, permanent_pincode,
        correspondence_hno, correspondence_street, correspondence_city,
        correspondence_district, correspondence_state, correspondence_pincode,
        admission_year
      ], async (err) => {

        if (err) {
          console.error("Insert error:", err);
          if (req.files["photo"])     deleteFile(req.files["photo"][0].path);
          if (req.files["signature"]) deleteFile(req.files["signature"][0].path);
          return res.status(500).send("Database Error: " + err.message);
        }

        const studentFolder = `uploads/students/${studentId}`;
        fs.mkdirSync(studentFolder, { recursive: true });

        let photoPath = null;
        let signPath  = null;

        if (req.files["photo"]) {
          photoPath = `${studentFolder}/photo.jpg`;
          fs.renameSync(req.files["photo"][0].path, photoPath);
        }

        if (req.files["signature"]) {
          signPath = `${studentFolder}/signature.jpg`;
          fs.renameSync(req.files["signature"][0].path, signPath);
        }

        // Generate unique QR token
        let qrToken;
        let isUnique = false;
        let attempts = 0;
        
        while (!isUnique && attempts < 10) {
          qrToken = crypto.randomBytes(16).toString('hex');
          
          // Check if token already exists
          const checkQuery = `SELECT COUNT(*) as count FROM students WHERE qr_token = ?`;
          const result = await new Promise((resolve, reject) => {
            db.query(checkQuery, [qrToken], (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
          
          if (result[0].count === 0) {
            isUnique = true;
          }
          attempts++;
        }
        
        if (!isUnique) {
          throw new Error('Could not generate unique QR token');
        }

        const qrData  = `${studentId}|${qrToken}`;
        const qrPath  = `${studentFolder}/qr.png`;
        await QRCode.toFile(qrPath, qrData);

        db.query(
          `UPDATE students SET photo=?, signature=?, qr_token=? WHERE student_id=?`,
          [photoPath, signPath, qrToken, studentId]
        );

        return res.send(
          `Student Registered Successfully. Your Student ID is: <strong>${studentId}</strong>. ` +
          `Please use this ID to set your password.`
        );

      });

    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).send("Server Error");
  }

});

/*POST /students/send-otp */

router.post("/send-otp", (req, res) => {

  const { student_id, name, department, course } = req.body;

  if (!student_id || !name || !department || !course) {
    return res.status(400).send("All fields are required");
  }

  const query = `
    SELECT student_id, first_name, second_name, email
    FROM students
    WHERE student_id = ?
      AND TRIM(CONCAT(first_name, ' ', second_name)) = TRIM(?)
      AND department = ?
      AND course = ?
  `;

  db.query(query, [student_id, name, department, course], (err, results) => {

    if (err)                  return res.status(500).send("Database Error");
    if (results.length === 0) return res.status(404).send("Student not found. Please check your details.");

    db.query(
      `SELECT password_hash FROM student_login WHERE student_id = ?`,
      [student_id],
      (err, passResult) => {

        if (err) return res.status(500).send("Database Error");

        if (passResult.length > 0 && passResult[0].password_hash) {
          return res.status(400).send("Password already set. Please use the login page.");
        }

        const otp     = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000;

        req.session.otp = { code: otp, expires, student_id };

        // Send OTP via email
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

/* POST /students/verify-otp*/

router.post("/verify-otp", (req, res) => {

  const { otp }  = req.body;
  const stored   = req.session.otp;

  if (!otp)     return res.status(400).send("OTP is required");
  if (!stored)  return res.status(400).send("No OTP requested. Please request a new OTP.");

  if (Date.now() > stored.expires) {
    delete req.session.otp;
    return res.status(400).send("OTP expired. Please request a new OTP.");
  }

  if (otp.trim() !== stored.code) {
    return res.status(400).send("Invalid OTP. Please try again.");
  }

  req.session.otpVerified    = true;
  req.session.pendingStudent = stored.student_id;
  delete req.session.otp;

  res.send("OTP Verified");

});

/*POST /students/set-password*/

router.post("/set-password", (req, res) => {

  const { password } = req.body;

  if (!req.session.otpVerified || !req.session.pendingStudent) {
    return res.status(403).send("Unauthorized. Please verify OTP first.");
  }

  if (!password || password.length < 6) {
    return res.status(400).send("Password must be at least 6 characters");
  }

  const student_id = req.session.pendingStudent;

  db.query(
    `INSERT INTO student_login (student_id, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = ?`,
    [student_id, password, password],
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

});

module.exports = router;