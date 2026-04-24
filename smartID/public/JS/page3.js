function showToast(msg) {
    const t = document.getElementById("toast");
    t.innerText = msg;
    t.style.display = "block";
    setTimeout(() => t.style.display = "none", 2000);
}

async function setPassword() {

    const p = document.getElementById("password").value;
    const c = document.getElementById("confirmPassword").value;

    if (p !== c) {
        showToast("Passwords do not match");
        return;
    }

    const res = await fetch('/student/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p })
    });

    const msg = await res.text();

    if (!res.ok) {
        showToast(msg);
        return;
    }

    showToast("Password set");

    setTimeout(() => {
        window.location.href = "/student/login";
    }, 1000);
}