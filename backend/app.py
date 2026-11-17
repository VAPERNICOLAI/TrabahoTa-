
import sqlite3

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

from database import init_db, get_db_connection


app = Flask(__name__)

# Allow frontend requests from VS Code Live Server
CORS(app, resources={
    r"/api/*": {
        "origins": [
            "http://127.0.0.1:5500",
            "http://localhost:5500"
        ]
    }
})

# Initialize SQLite database
init_db()


# API 1: HEALTH CHECK
@app.route("/api/health", methods=["GET"])
def health_check():
    connection = get_db_connection()

    try:
        connection.execute("SELECT 1")
        database_status = "connected"
    except sqlite3.Error:
        database_status = "error"
    finally:
        connection.close()

    return jsonify({
        "message": "TrabahoTa API is running",
        "database": database_status
    }), 200 if database_status == "connected" else 503


# API 2: GET JOB OPPORTUNITIES
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
                dict(opportunity) for opportunity in opportunities
            ]
        }), 200

    finally:
        connection.close()


# API 3: STUDENT AND COMPANY REGISTRATION
@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required"
        }), 400

    full_name = data.get("full_name")
    email = data.get("email")
    password = data.get("password")
    role = data.get("role")
    company_name = data.get("company_name")

    if not all(isinstance(value, str) for value in
               [full_name, email, password, role]):
        return jsonify({
            "error": "Invalid or missing fields"
        }), 400

    full_name = full_name.strip()
    email = email.strip().lower()
    role = role.strip().lower()

    if not full_name or not email or not password:
        return jsonify({
            "error": "Required fields cannot be empty"
        }), 400

    if role not in ("student", "company"):
        return jsonify({
            "error": "Role must be student or company"
        }), 400

    if role == "student" and not email.endswith("@my.xu.edu.ph"):
        return jsonify({
            "error": "Students must use an XU email address"
        }), 400

    if role == "company" and (
        not isinstance(company_name, str)
        or not company_name.strip()
    ):
        return jsonify({
            "error": "Company name is required"
        }), 400

    if len(password) < 8:
        return jsonify({
            "error": "Password must contain at least 8 characters"
        }), 400

    connection = get_db_connection()

    try:
        cursor = connection.execute("""
            INSERT INTO users
                (full_name, email, password_hash, role)
            VALUES (?, ?, ?, ?)
        """, (
            full_name,
            email,
            generate_password_hash(password),
            role
        ))

        user_id = cursor.lastrowid

        if role == "company":
            connection.execute("""
                INSERT INTO companies (user_id, company_name)
                VALUES (?, ?)
            """, (user_id, company_name.strip()))

        connection.commit()

        return jsonify({
            "message": "Registration successful",
            "user_id": user_id,
            "role": role,
            "verified": False
        }), 201

    except sqlite3.IntegrityError:
        connection.rollback()
        return jsonify({
            "error": "Email already registered or invalid data"
        }), 409

    finally:
        connection.close()


# API 4: STUDENT AND COMPANY LOGIN
@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required"
        }), 400

    email = data.get("email")
    password = data.get("password")

    if not isinstance(email, str) or not isinstance(password, str):
        return jsonify({
            "error": "Email and password are required"
        }), 400

    email = email.strip().lower()

    if not email or not password:
        return jsonify({
            "error": "Email and password are required"
        }), 400

    connection = get_db_connection()

    try:
        user = connection.execute("""
            SELECT
                id,
                full_name,
                email,
                password_hash,
                role,
                is_verified
            FROM users
            WHERE email = ?
        """, (email,)).fetchone()

        if user is None or not check_password_hash(
            user["password_hash"], password
        ):
            return jsonify({
                "error": "Invalid email or password"
            }), 401

        return jsonify({
            "message": "Login credentials verified",
            "user": {
                "id": user["id"],
                "full_name": user["full_name"],
                "email": user["email"],
                "role": user["role"],
                "is_verified": bool(user["is_verified"])
            }
        }), 200

    finally:
        connection.close()


# START FLASK SERVER
if __name__ == "__main__":
    app.run(debug=True)

