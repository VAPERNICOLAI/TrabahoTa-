
const REGISTER_API = "http://127.0.0.1:5000/api/auth/register";

const form = document.getElementById("register-form");
const roleSelect = document.getElementById("role");
const companyGroup = document.getElementById("company-group");
const companyInput = document.getElementById("company_name");
const message = document.getElementById("message");
const submitButton = document.getElementById("submit-button");

// Show company name field when Company is selected
function updateRole() {
    const isCompany = roleSelect.value === "company";

    companyGroup.style.display = isCompany ? "block" : "none";
    companyInput.required = isCompany;

    if (!isCompany) {
        companyInput.value = "";
    }
}

// Display colored feedback below Create Account
function showMessage(text, type) {
    message.textContent = text;
    message.className = "form-message " + type;
}

roleSelect.addEventListener("change", updateRole);
updateRole();

// Handle registration
form.addEventListener("submit", async function (event) {
    event.preventDefault();

    message.textContent = "";
    message.className = "form-message";

    const data = {
        full_name: document.getElementById("full_name").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: document.getElementById("password").value,
        role: roleSelect.value
    };

    // Validate XU student email
    if (
        data.role === "student" &&
        !data.email.toLowerCase().endsWith("@my.xu.edu.ph")
    ) {
        showMessage(
            "✕ Students must use an XU email address.",
            "error"
        );
        return;
    }

    if (data.role === "company") {
        data.company_name = companyInput.value.trim();
    }

    submitButton.disabled = true;
    submitButton.textContent = "Creating account...";

    try {
        const response = await fetch(REGISTER_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || "Registration failed");
        }

        // Show green success message below button
        showMessage(
            "✓ Registration Successful! Your account has been created. You can now log in.",
            "success"
        );

        form.reset();
        updateRole();

    } catch (error) {
        // Show red error message below button
        showMessage(
            "✕ " + error.message,
            "error"
        );

    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Create Account";
    }
});
