
const API_BASE = "http://127.0.0.1:5000/api";

document.addEventListener("DOMContentLoaded", async function () {
    const welcomeMessage = document.getElementById("welcome-message");
    const opportunityCount = document.getElementById("opportunity-count");
    const opportunitiesList = document.getElementById("opportunities-list");
    const logoutButton = document.getElementById("logout-btn");

    // Verify login session.
    try {
        const response = await fetch(`${API_BASE}/auth/me`, {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {
            window.location.replace("login.html");
            return;
        }

        const result = await response.json();
        const user = result.user;

        if (!user || user.role !== "student") {
            window.location.replace("login.html");
            return;
        }

        welcomeMessage.textContent = `Welcome, ${user.full_name}!`;

    } catch (error) {
        console.error("Authentication error:", error);
        window.location.replace("login.html");
        return;
    }

    // Load opportunities.
    try {
        const response = await fetch(`${API_BASE}/opportunities`);

        if (!response.ok) {
            throw new Error("Unable to load opportunities.");
        }

        const result = await response.json();

        const opportunities = Array.isArray(result)
            ? result
            : result.opportunities;

        if (!Array.isArray(opportunities)) {
            throw new Error("Invalid opportunities response.");
        }

        opportunityCount.textContent = opportunities.length;
        opportunitiesList.innerHTML = "";

        if (opportunities.length === 0) {
            opportunitiesList.textContent =
                "No opportunities available at the moment.";
        } else {
            opportunities.forEach((opportunity) => {
                const card = document.createElement("div");
                card.className = "opportunity-card";

                const title = document.createElement("h3");
                title.textContent =
                    opportunity.title || "Untitled Opportunity";

                const type = document.createElement("p");
                type.textContent =
                    "Type: " +
                    (opportunity.opportunity_type || "Not specified");

                const location = document.createElement("p");
                location.textContent =
                    "Location: " +
                    (opportunity.location || "Not specified");

                const description = document.createElement("p");
                description.textContent =
                    opportunity.description || "";

                card.append(title, type, location, description);
                opportunitiesList.appendChild(card);
            });
        }

    } catch (error) {
        console.error("Opportunities error:", error);
        opportunityCount.textContent = "—";
        opportunitiesList.textContent =
            "Unable to load opportunities.";
    }

    // Logout.
    logoutButton.addEventListener("click", async function () {
        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {
            const response = await fetch(`${API_BASE}/auth/logout`, {
                method: "POST",
                credentials: "include"
            });

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
