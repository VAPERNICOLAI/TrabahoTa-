
const LOGIN_API = "http://127.0.0.1:5000/api/auth/login";

document.addEventListener("DOMContentLoaded", function () {
    console.log("TrabahoTa login.js loaded successfully!");

    const form = document.getElementById("login-form");
    const button = document.getElementById("login-button");
    const message = document.getElementById("message");

    if (!form || !button || !message) {
        console.error("Login form elements are missing!");
        return;
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = "form-message " + type;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        console.log("Login button clicked!");

        message.textContent = "";
        message.className = "form-message";

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        button.disabled = true;
        button.textContent = "Logging in...";

        try {
            const response = await fetch(LOGIN_API, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email: email,
                    password: password
                })
            });

            console.log("Login API status:", response.status);

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    result.error || "Login failed"
                );
            }

            showMessage(
                "✓ Login Successful! Welcome back, " +
                result.user.full_name + "!",
                "success"
            );

            document.getElementById("password").value = "";

        } catch (error) {
            console.error("Login error:", error);

            showMessage(
                "✕ " + error.message,
                "error"
            );

        } finally {
            button.disabled = false;
            button.textContent = "Login";
        }
    });
});
