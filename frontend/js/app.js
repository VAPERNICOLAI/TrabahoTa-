
/* TRABAHOTA! — FRONTEND JAVASCRIPT */

const API_URL = "http://127.0.0.1:5000/api";

// Load available job opportunities
async function loadOpportunities() {
    const opportunityList = document.getElementById("opportunity-list");

    if (!opportunityList) {
        return;
    }

    opportunityList.textContent = "Loading opportunities...";

    try {
        const response = await fetch(`${API_URL}/opportunities`);

        if (!response.ok) {
            throw new Error("Failed to fetch opportunities");
        }

        const data = await response.json();

        opportunityList.replaceChildren();

        if (!data.opportunities || data.opportunities.length === 0) {
            const message = document.createElement("p");
            message.textContent = "No opportunities available yet. Check back soon!";
            opportunityList.appendChild(message);
            return;
        }

        data.opportunities.forEach((job) => {
            const card = document.createElement("article");
            card.className = "opportunity-card";

            const title = document.createElement("h3");
            title.textContent = job.title;

            const company = document.createElement("p");
            company.textContent = `Company: ${job.company_name}`;

            const description = document.createElement("p");
            description.textContent = job.description;

            const location = document.createElement("p");
            location.textContent = `Location: ${job.location || "Not specified"}`;

            const deadline = document.createElement("p");
            deadline.textContent = `Deadline: ${job.deadline || "Open until filled"}`;

            const type = document.createElement("span");
            type.className = "type";
            type.textContent = job.opportunity_type;

            card.append(
                title,
                company,
                description,
                location,
                deadline,
                type
            );

            opportunityList.appendChild(card);
        });

    } catch (error) {
        console.error("TrabahoTa API error:", error);

        opportunityList.replaceChildren();

        const message = document.createElement("p");
        message.textContent =
            "Unable to load opportunities. Please check that the Flask server is running.";

        opportunityList.appendChild(message);
    }
}

// Run after the HTML page finishes loading
document.addEventListener("DOMContentLoaded", loadOpportunities);
