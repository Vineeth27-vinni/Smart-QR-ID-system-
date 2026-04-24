// Load courses on page load
document.addEventListener('DOMContentLoaded', function () {

  loadCourses();

  document.getElementById('sendOtpBtn').addEventListener('click', sendOTP);
  document.getElementById('verifyOtpBtn').addEventListener('click', verifyOTP);
  document.getElementById('setPasswordBtn').addEventListener('click', setPassword);
  document.getElementById('department').addEventListener('change', updateCourses);
});


/* ================= LOAD COURSES ================= */

async function loadCourses() {
  try {
    const response = await fetch('/student/get-courses');

    if (!response.ok) throw new Error("Failed API");

    const courses = await response.json();

    const departmentDropdown = document.getElementById('department');
    departmentDropdown.innerHTML = '<option value="">Select Department</option>';

    Object.keys(courses).forEach(dept => {
      const option = document.createElement('option');
      option.value = dept;
      option.text = dept;
      departmentDropdown.appendChild(option);
    });

    // Store globally
    window.coursesByDepartment = courses;

  } catch (error) {
    console.error('Error loading courses:', error);
    alert('Failed to load departments. Check server.');
  }
}




function updateCourses() {

  const dept = document.getElementById('department').value;
  const courseDropdown = document.getElementById('course');

  courseDropdown.innerHTML = '<option value="">Select Course</option>';

  if (dept && window.coursesByDepartment && window.coursesByDepartment[dept]) {

    window.coursesByDepartment[dept].forEach(course => {
      const option = document.createElement('option');
      option.value = course;
      option.text = course;
      courseDropdown.appendChild(option);
    });

  }
}



async function sendOTP() {

  const student_id = document.getElementById('student_id').value.trim();
  const name = document.getElementById('name').value.trim();
  const department = document.getElementById('department').value;
  const course = document.getElementById('course').value;

  if (!student_id || !name || !department || !course) {
    alert('Please fill all fields');
    return;
  }

  try {
    const response = await fetch('/student/send-otp', { // ✅ FIXED
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, name, department, course })
    });

    const message = await response.text();

    if (!response.ok) {
      alert(message);
      return;
    }

    alert(message);
    document.getElementById('otpSection').style.display = 'block';

  } catch (error) {
    console.error(error);
    alert('Error sending OTP');
  }
}




async function verifyOTP() {

  const otp = document.getElementById('otp').value.trim();

  if (!otp) {
    alert('Enter OTP');
    return;
  }

  try {
    const response = await fetch('/student/verify-otp', { // ✅ FIXED
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp })
    });

    const message = await response.text();

    if (!response.ok) {
      alert(message);
      return;
    }

    alert(message);
    document.getElementById('passwordSection').style.display = 'block';

  } catch (error) {
    console.error(error);
    alert('Error verifying OTP');
  }
}


/* ================= SET PASSWORD ================= */

async function setPassword() {

  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!password || !confirmPassword) {
    alert('Fill password fields');
    return;
  }

  if (password.length < 6) {
    alert('Password must be at least 6 characters');
    return;
  }

  if (password !== confirmPassword) {
    alert('Passwords do not match');
    return;
  }

  try {
    const response = await fetch('/student/set-password', { // ✅ FIXED
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    const message = await response.text();

    if (!response.ok) {
      alert(message);
      return;
    }

    alert(message);

    // Redirect after success
    window.location.href = '/student/login';

  } catch (error) {
    console.error(error);
    alert('Error setting password');
  }
}