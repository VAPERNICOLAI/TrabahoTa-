
const COMPANY_API_BASE = "http://127.0.0.1:5000/api";

document.addEventListener("DOMContentLoaded", async function () {
    const welcomeMessage = document.getElementById("welcome-message");
    const logoutButton = document.getElementById("logout-btn");

    // Check the logged-in user's session and role.
    try {
        const response = await fetch(
            `${COMPANY_API_BASE}/auth/me`,
            {
                method: "GET",
                credentials: "include"
            }
        );

        if (!response.ok) {
            window.location.replace("login.html");
            return;
        }

        const result = await response.json();
        const user = result.user;

        if (!user || user.role !== "company") {
            window.location.replace("login.html");
            return;
        }

        welcomeMessage.textContent =
            `Welcome, ${user.full_name}!`;

        // Confirm company-role API access.
        const dashboardResponse = await fetch(
            `${COMPANY_API_BASE}/company/dashboard`,
            {
                method: "GET",
                credentials: "include"
            }
        );

        if (!dashboardResponse.ok) {
            throw new Error(
                "Unable to access the company dashboard API."
            );
        }

        console.log(
            "Company dashboard access verified:",
            await dashboardResponse.json()
        );

    } catch (error) {
        console.error("Company dashboard error:", error);

        welcomeMessage.textContent =
            "Unable to verify company dashboard access.";

        return;
    }

    // Logout functionality.
    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {
            const response = await fetch(
                `${COMPANY_API_BASE}/auth/logout`,
                {
                    method: "POST",
                    credentials: "include"
                }
            );

            if (!response.ok) {
                throw new Error("Logout failed.");
            }

            window.location.replace("login.html");

        } catch (error) {
            console.error("Logout error:", error);
            alert("Unable to log out. Please try again.");

            logoutButton.disabled = false;
            logoutButton.textContent = "Logout";
        }
    });
});
