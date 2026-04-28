const express = require("express");
const router  = express.Router();
const db      = require("../db");

/* MIDDLEWARE — Ensure user is a Mess Incharge */
function isMessIncharge(req, res, next) {
    if (req.session && req.session.staff && req.session.staff.role === 'Mess incharge') {
        return next();
    }
    return res.status(403).json({ error: "Access denied. Mess Incharge role required." });
}

/* GET /mess/stats */
router.get("/stats", isMessIncharge, (req, res) => {
    const hostel = req.session.staff.hostel;
    
    // Total students assigned to this hostel
    const q1 = `SELECT COUNT(*) as total FROM students WHERE assigned_hostel = ? AND hostel_application_status = 'approved'`;
    
    // Total students visited today
    const q2 = `SELECT COUNT(DISTINCT student_id) as visited FROM mess_records WHERE recorded_at >= CURDATE() AND student_id IN (SELECT student_id FROM students WHERE assigned_hostel = ?)`;

    db.query(q1, [hostel], (err, r1) => {
        if (err) return res.status(500).json({ error: "DB error" });
        
        db.query(q2, [hostel], (err, r2) => {
            if (err) return res.status(500).json({ error: "DB error" });
            
            res.json({
                totalStudents: r1[0].total,
                visitedToday: r2[0].visited,
                hostelName: hostel
            });
        });
    });
});

/* POST /mess/scan */
router.post("/scan", isMessIncharge, (req, res) => {
    const { student_id, meal_type } = req.body;
    const hostel = req.session.staff.hostel;

    if (!student_id) return res.status(400).json({ success: false, message: "Invalid QR data" });

    // Verify if student belongs to this hostel
    db.query(
        "SELECT first_name, second_name, assigned_hostel FROM students WHERE student_id = ? AND hostel_application_status = 'approved'",
        [student_id],
        (err, results) => {
            if (err) return res.status(500).json({ success: false, message: "DB Error" });
            if (results.length === 0) return res.status(404).json({ success: false, message: "Student not found or not approved for hostel" });

            const student = results[0];
            if (student.assigned_hostel !== hostel) {
                return res.status(403).json({ success: false, message: `Student belongs to ${student.assigned_hostel}, not this mess.` });
            }

            // Record the visit
            db.query(
                "INSERT INTO mess_records (student_id, meal_type) VALUES (?, ?)",
                [student_id, meal_type || 'Special'],
                (err) => {
                    if (err) return res.status(500).json({ success: false, message: "Failed to record visit" });
                    res.json({ 
                        success: true, 
                        message: `Access Granted: ${student.first_name} ${student.second_name}`,
                        name: `${student.first_name} ${student.second_name}`
                    });
                }
            );
        }
    );
});

module.exports = router;
