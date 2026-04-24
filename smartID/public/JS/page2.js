const inputs = document.querySelectorAll(".otp-box");

inputs.forEach((i, index) => {
    i.addEventListener("input", () => {
        if (i.value && index < 5) inputs[index + 1].focus();
    });
});

function showToast(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.style.display = "block";
    setTimeout(() => t.style.display = "none", 2000);
}

function getOTP() {
    return Array.from(inputs).map(i => i.value).join("");
}

async function verifyOTP() {

    const otp = getOTP();

    const res = await fetch('/student/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp })
    });

    const msg = await res.text();

    if (!res.ok) {
        showToast(msg);
        return;
    }

    showToast("Verified");

    setTimeout(() => {
        window.location.href = "/Registration/set-password.html";
    }, 1000);
}

/* RESEND TIMER */

let time = 30;
const btn = document.getElementById("resendBtn");

const timer = setInterval(() => {
    btn.innerText = `Resend OTP (${time}s)`;
    time--;

    if (time < 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.innerText = "Resend OTP";
    }
}, 1000);

function resendOTP() {
    const studentDetails = JSON.parse(sessionStorage.getItem("studentDetails"));
    if (!studentDetails) {
        showToast("Error: Missing student details");
        return;
    }
    
    fetch('/student/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentDetails)
    });
    showToast("OTP Resent");
}