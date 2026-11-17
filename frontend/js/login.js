
const LOGIN_API = "http://127.0.0.1:5000/api/auth/login";

const loginForm = document.getElementById("login-form");
const loginButton = document.getElementById("login-button");
const loginMessage = document.getElementById("message");

function showLoginMessage(text, type) {
    loginMessage.textContent = text;
    loginMessage.className = "form-message " + type;
}

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    loginMessage.textContent = "";
    loginMessage.className = "form-message";

    const data = {
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value
    };

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
        const response = await fetch(LOGIN_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Login failed");
        }

        showLoginMessage(
            "✓ Login Successful! Welcome back, " +
            result.user.full_name + "!",
            "success"
        );

        // Clear password after successful verification
        document.getElementById("password").value = "";

        // No automatic redirect yet.
        // Authentication sessions and dashboards
        // will be implemented in the next phase.

    } catch (error) {
        showLoginMessage("✕ " + error.message, "error");

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = "Login";
    }
});
