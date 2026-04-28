const express = require("express");
const router  = express.Router();
const db      = require("../db");

/* MIDDLEWARE — Ensure user is a Warden */
function isWarden(req, res, next) {
    if (req.session && req.session.staff && req.session.staff.role === 'Warden') {
        return next();
    }
    return res.status(403).json({ error: "Access denied. Warden role required." });
}

/* GET /warden/stats */
router.get("/stats", isWarden, (req, res) => {
    const hostel = req.query.hostel || req.session.staff.hostel;
    db.query(`SELECT no_of_rooms, vacancies, occupied FROM hostels WHERE hostel_name = ?`, [hostel], (err, results) => {
        if (err) return res.status(500).json({ error: "DB error" });
        res.json(results[0] || {});
    });
});

/* GET /warden/applications */
router.get("/applications", isWarden, (req, res) => {
    const hostel = req.query.hostel || req.session.staff.hostel;
    db.query(
        `SELECT student_id, first_name, second_name, course, department 
         FROM students 
         WHERE hostel_preference = ? AND hostel_application_status = 'pending'`,
        [hostel],
        (err, results) => {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json(results);
        }
    );
});

/* GET /warden/residents */
router.get("/residents", isWarden, (req, res) => {
    const hostel = req.query.hostel || req.session.staff.hostel;
    db.query(
        `SELECT student_id, first_name, second_name, course, mobile_number 
         FROM students 
         WHERE assigned_hostel = ? AND hostel_application_status = 'approved'`,
        [hostel],
        (err, results) => {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json(results);
        }
    );
});

/* POST /warden/process-application */
router.post("/process-application", isWarden, (req, res) => {
    const { student_id, status, hostel } = req.body;
    const targetHostel = hostel || req.session.staff.hostel;

    if (status === 'approved') {
        db.query(`SELECT vacancies FROM hostels WHERE hostel_name = ?`, [targetHostel], (err, results) => {
            if (err || results.length === 0) return res.status(500).json({ success: false, message: "Hostel not found" });
            if (results[0].vacancies <= 0) return res.status(400).json({ success: false, message: "No vacancies available" });

            db.beginTransaction((err) => {
                if (err) return res.status(500).json({ success: false, message: "Transaction error" });

                db.query(
                    `UPDATE students SET assigned_hostel = ?, hostel_application_status = 'approved' WHERE student_id = ?`,
                    [targetHostel, student_id],
                    (err) => {
                        if (err) return db.rollback(() => res.status(500).json({ success: false, message: "Update student failed" }));

                        db.query(
                            `UPDATE hostels SET occupied = occupied + 1, vacancies = vacancies - 1 WHERE hostel_name = ?`,
                            [targetHostel],
                            (err) => {
                                if (err) return db.rollback(() => res.status(500).json({ success: false, message: "Update hostel failed" }));
                                db.commit(err => {
                                    if (err) return db.rollback(() => res.status(500).json({ success: false, message: "Commit failed" }));
                                    res.json({ success: true, message: "Application approved!" });
                                });
                            }
                        );
                    }
                );
            });
        });
    } else {
        db.query(
            `UPDATE students SET hostel_application_status = 'rejected', hostel_preference = NULL WHERE student_id = ?`,
            [student_id],
            (err) => {
                if (err) return res.status(500).json({ success: false, message: "Database error" });
                res.json({ success: true, message: "Application rejected." });
            }
        );
    }
});

/* POST /warden/remove-resident */
router.post("/remove-resident", isWarden, (req, res) => {
    const { student_id, hostel } = req.body;
    const targetHostel = hostel || req.session.staff.hostel;

    console.log(`[WARDEN ROUTE] Removing student ${student_id} from ${targetHostel}`);

    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ success: false, message: "Transaction error" });

        db.query(
            `UPDATE students SET assigned_hostel = NULL, hostel_preference = NULL, hostel_application_status = 'none' WHERE student_id = ?`,
            [student_id],
            (err) => {
                if (err) {
                    console.error("Student update error:", err);
                    return db.rollback(() => res.status(500).json({ success: false, message: "Update student failed" }));
                }

                db.query(
                    `UPDATE hostels SET occupied = occupied - 1, vacancies = vacancies + 1 WHERE hostel_name = ?`,
                    [targetHostel],
                    (err) => {
                        if (err) {
                            console.error("Hostel update error:", err);
                            return db.rollback(() => res.status(500).json({ success: false, message: "Update hostel failed" }));
                        }
                        db.commit(err => {
                            if (err) return db.rollback(() => res.status(500).json({ success: false, message: "Commit failed" }));
                            res.json({ success: true, message: "Resident removed successfully." });
                        });
                    }
                );
            }
        );
    });
});

module.exports = router;
