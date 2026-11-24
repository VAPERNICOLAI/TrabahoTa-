
const LOGIN_API = (["localhost", "127.0.0.1"].includes(window.location.hostname) ? "http://127.0.0.1:5000" : "") + "/api/auth/login";

document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("login-form");
    const button = document.getElementById("login-button");
    const message = document.getElementById("message");

    if (!form || !button || !message) {
        console.error("Login form elements are missing.");
        return;
    }

    function showMessage(text, type) {
        message.textContent = text;
        message.className = "form-message " + type;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

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

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Login failed.");
            }

            if (!result.user) {
                throw new Error("User information was not returned.");
            }

            showMessage(
                "Login successful! Welcome, " +
                result.user.full_name + "!",
                "success"
            );

            document.getElementById("password").value = "";

            if (result.user.role === "student") {
                window.location.replace("student-dashboard.html");

            } else if (result.user.role === "company") {
                window.location.replace("company-dashboard.html");

            } else {
                showMessage(
                    "Login successful, but the account role is unsupported.",
                    "error"
                );
            }

        } catch (error) {
            console.error("Login error:", error);
            showMessage(error.message, "error");

        } finally {
            button.disabled = false;
            button.textContent = "Login";
        }
    });
});
