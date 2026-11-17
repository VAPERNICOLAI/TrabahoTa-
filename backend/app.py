
from flask import Flask, jsonify
from database import init_db, get_db_connection

app = Flask(__name__)

# Initialize SQLite database
init_db()


# API 1: Health Check
@app.route("/api/health", methods=["GET"])
def health_check():
    connection = get_db_connection()

    try:
        connection.execute("SELECT 1")
        database_status = "connected"
    except Exception:
        database_status = "error"
    finally:
        connection.close()

    return jsonify({
        "message": "TrabahoTa API is running",
        "database": database_status
    }), 200 if database_status == "connected" else 503


# API 2: Get Job Opportunities
@app.route("/api/opportunities", methods=["GET"])
def get_opportunities():
    connection = get_db_connection()

    try:
        opportunities = connection.execute("""
            SELECT
                opportunities.id,
                opportunities.title,
                opportunities.description,
                opportunities.opportunity_type,
                opportunities.location,
                opportunities.deadline,
                opportunities.status,
                companies.company_name
            FROM opportunities
            JOIN companies
                ON opportunities.company_id = companies.id
            WHERE opportunities.status = 'open'
              AND companies.is_approved = 1
              AND (
                  opportunities.deadline IS NULL
                  OR opportunities.deadline >= DATE('now')
              )
            ORDER BY opportunities.created_at DESC,
                     opportunities.id DESC
        """).fetchall()

        return jsonify({
            "opportunities": [
                dict(opportunity)
                for opportunity in opportunities
            ]
        }), 200

    finally:
        connection.close()


if __name__ == "__main__":
    app.run(debug=True)
