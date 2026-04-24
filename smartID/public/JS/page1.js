document.addEventListener("DOMContentLoaded", loadCourses);

async function loadCourses() {
    const res = await fetch('/student/get-courses');
    const data = await res.json();

    const dept = document.getElementById('department');

    Object.keys(data).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.text = d;
        dept.appendChild(opt);
    });

    window.courses = data;

    dept.addEventListener("change", () => {
        const course = document.getElementById('course');
        course.innerHTML = '<option value="">Select Course</option>';

        if (data[dept.value]) {
            data[dept.value].forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.text = c;
                course.appendChild(opt);
            });
        }
    });
}

function showToast(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.style.display = "block";
    setTimeout(() => t.style.display = "none", 2000);
}

function showSpinner(show) {
    document.getElementById("spinner").style.display = show ? "block" : "none";
}

async function sendOTP() {

    const student_id = document.getElementById('student_id').value;
    const name = document.getElementById('name').value;
    const department = document.getElementById('department').value;
    const course = document.getElementById('course').value;

    showSpinner(true);

    const res = await fetch('/student/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id, name, department, course })
    });

    showSpinner(false);

    const msg = await res.text();

    if (!res.ok) {
        showToast(msg);
        return;
    }

    showToast("OTP Sent");

    // store temporarily
    sessionStorage.setItem("studentDetails", JSON.stringify({ student_id, name, department, course }));

    setTimeout(() => {
        window.location.href = "/Registration/verify-otp.html";
    }, 1000);
}