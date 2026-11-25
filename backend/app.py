
import os
import sqlite3
import psycopg
from datetime import date, datetime, timedelta
from functools import wraps
from io import BytesIO

from flask import Flask, jsonify, request, session, send_file
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from werkzeug.exceptions import RequestEntityTooLarge
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from database import init_db, get_db_connection, USE_POSTGRES


# =====================================================
# TRABAHOTA! FLASK APPLICATION
# =====================================================

app = Flask(__name__)

# =====================================================
# FLASK SECURITY CONFIGURATION
# =====================================================

IS_PRODUCTION = (
    os.environ.get("FLASK_ENV", "development").lower()
    == "production"
)

SECRET_KEY = os.environ.get("FLASK_SECRET_KEY")

if IS_PRODUCTION and not SECRET_KEY:
    raise RuntimeError(
        "FLASK_SECRET_KEY is required in production"
    )

app.config["SECRET_KEY"] = (
    SECRET_KEY or "dev-only-change-this-before-deployment"
)

app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=8)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = (
    "Lax"
)
app.config["SESSION_COOKIE_SECURE"] = IS_PRODUCTION

# =====================================================
# CORS CONFIGURATION
# =====================================================


ALLOWED_ORIGINS = (
    ["https://trabahota.netlify.app"]
    if IS_PRODUCTION else
    [
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
)


CORS(
    app,
    resources={
        r"/api/*": {
            "origins": ALLOWED_ORIGINS
        }
    },
    supports_credentials=True
)





@app.before_request
def protect_against_csrf():
    if not request.path.startswith("/api/"):
        return None


    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return None


    origin = request.headers.get("Origin")


    if origin not in ALLOWED_ORIGINS:
        return jsonify({
            "error": "Request origin is not allowed"
        }), 403


    return None



init_db()

# =====================================================
# DATABASE COMPATIBILITY HELPERS
# =====================================================

DATABASE_ERRORS = (sqlite3.Error, psycopg.Error)

INTEGRITY_ERRORS = (
    sqlite3.IntegrityError,
    psycopg.IntegrityError
)


def execute_query(connection, query, params=()):
    if USE_POSTGRES:
        query = query.replace("?", "%s")
        query = query.replace("DATE('now')", "CURRENT_DATE")

    return connection.execute(query, params)


def serialize_row(row):
    result = dict(row)

    for key, value in result.items():
        if isinstance(value, (date, datetime)):
            result[key] = value.isoformat()

    return result


def insert_and_get_id(connection, query, params=()):
    if USE_POSTGRES:
        query = query.strip().rstrip(";") + " RETURNING id"
        cursor = execute_query(connection, query, params)
        return cursor.fetchone()["id"]

    cursor = execute_query(connection, query, params)
    return cursor.lastrowid



# =====================================================
# AUTHENTICATION HELPERS
# =====================================================

def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({
                "error": "Authentication required"
            }), 401

        return view(*args, **kwargs)

    return wrapped


def role_required(required_role):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if "user_id" not in session:
                return jsonify({
                    "error": "Authentication required"
                }), 401

            connection = get_db_connection()

            try:
                user = execute_query(connection, """
                    SELECT role
                    FROM users
                    WHERE id = ?
                """, (session["user_id"],)).fetchone()
            finally:
                connection.close()

            if user is None:
                session.clear()
                return jsonify({
                    "error": "Session is no longer valid"
                }), 401

            if user["role"] != required_role:
                return jsonify({
                    "error": "Access denied"
                }), 403

            return view(*args, **kwargs)

        return wrapped

    return decorator


def get_company(connection):
    return execute_query(connection, """
        SELECT id, user_id, company_name, is_approved
        FROM companies
        WHERE user_id = ?
    """, (session["user_id"],)).fetchone()


# =====================================================
# OPPORTUNITY VALIDATION
# =====================================================

OPPORTUNITY_FIELDS = {
    "title",
    "description",
    "opportunity_type",
    "location",
    "deadline",
    "status"
}

OPPORTUNITY_TYPES = {
    "job",
    "internship",
    "ojt"
}

OPPORTUNITY_STATUSES = {
    "open",
    "closed"
}


def validate_opportunity(data, existing=None):
    if not isinstance(data, dict):
        return None, "A JSON object is required"

    if not data:
        return None, "Request body cannot be empty"

    unknown_fields = set(data) - OPPORTUNITY_FIELDS

    if unknown_fields:
        return None, (
            "Unknown fields: " +
            ", ".join(sorted(unknown_fields))
        )

    if existing is None:
        required = {
            "title",
            "description",
            "opportunity_type"
        }

        missing = required - set(data)

        if missing:
            return None, (
                "Missing required fields: " +
                ", ".join(sorted(missing))
            )

        values = {
            "title": "",
            "description": "",
            "opportunity_type": "",
            "location": None,
            "deadline": None,
            "status": "open"
        }
    else:
        values = serialize_row(existing)

    values.update(data)

    for field in ("title", "description", "opportunity_type"):
        value = values.get(field)

        if not isinstance(value, str) or not value.strip():
            return None, f"{field} must be a non-empty string"

        values[field] = value.strip()

    values["opportunity_type"] = (
        values["opportunity_type"].lower()
    )

    if values["opportunity_type"] not in OPPORTUNITY_TYPES:
        return None, (
            "opportunity_type must be job, internship, or ojt"
        )

    location = values.get("location")

    if location is not None:
        if not isinstance(location, str):
            return None, "location must be a string or null"

        values["location"] = location.strip() or None

    deadline = values.get("deadline")

    if deadline is not None:
        if not isinstance(deadline, str):
            return None, "deadline must use YYYY-MM-DD"

        try:
            parsed_deadline = date.fromisoformat(deadline)
        except ValueError:
            return None, "deadline must be a valid YYYY-MM-DD date"

        if parsed_deadline.isoformat() != deadline:
            return None, "deadline must use YYYY-MM-DD"

        if parsed_deadline < date.today():
            return None, "deadline cannot be in the past"

    status = values.get("status")

    if not isinstance(status, str):
        return None, "status must be open or closed"

    values["status"] = status.lower().strip()

    if values["status"] not in OPPORTUNITY_STATUSES:
        return None, "status must be open or closed"

    if existing is not None:
        if existing["status"] == "closed" and values["status"] == "open":
            return None, "Closed opportunities cannot be reopened"

    return values, None


# =====================================================
# API 1: HEALTH CHECK
# =====================================================

@app.route("/api/health", methods=["GET"])
def health_check():
    connection = get_db_connection()

    try:
        execute_query(connection, "SELECT 1")
        database_status = "connected"
    except DATABASE_ERRORS:
        database_status = "error"
    finally:
        connection.close()

    return jsonify({
        "message": "TrabahoTa API is running",
        "database": database_status
    }), 200 if database_status == "connected" else 503


# =====================================================
# API 2: PUBLIC OPPORTUNITIES
# =====================================================

@app.route("/api/opportunities", methods=["GET"])
def get_opportunities():
    connection = get_db_connection()

    try:
        rows = execute_query(connection, """
            SELECT
                o.id,
                o.title,
                o.description,
                o.opportunity_type,
                o.location,
                o.deadline,
                o.status,
                c.company_name
            FROM opportunities o
            JOIN companies c
                ON o.company_id = c.id
            WHERE o.status = 'open'
              AND c.is_approved = 1
              AND (
                  o.deadline IS NULL
                  OR o.deadline >= DATE('now')
              )
            ORDER BY o.created_at DESC, o.id DESC
        """).fetchall()

        return jsonify({
            "opportunities": [serialize_row(row) for row in rows]
        }), 200

    finally:
        connection.close()


# =====================================================
# API 3: REGISTRATION
# =====================================================

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

    if not all(
        isinstance(value, str)
        for value in (full_name, email, password, role)
    ):
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
        inserted_id = insert_and_get_id(connection, """
            INSERT INTO users
                (full_name, email, password_hash, role)
            VALUES (?, ?, ?, ?)
        """, (
            full_name,
            email,
            generate_password_hash(password),
            role
        ))

        user_id = inserted_id

        if role == "company":
            execute_query(connection, """
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

    except INTEGRITY_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Email already registered or invalid data"
        }), 409

    finally:
        connection.close()


# =====================================================
# API 4: LOGIN
# =====================================================

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
        user = execute_query(connection, """
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

        session.clear()
        session.permanent = True
        session["user_id"] = user["id"]
        session["role"] = user["role"]

        return jsonify({
            "message": "Login successful",
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


# =====================================================
# API 5: CURRENT USER
# =====================================================

@app.route("/api/auth/me", methods=["GET"])
@login_required
def current_user():
    connection = get_db_connection()

    try:
        user = execute_query(connection, """
            SELECT id, full_name, email, role, is_verified
            FROM users
            WHERE id = ?
        """, (session["user_id"],)).fetchone()

        if user is None or user["role"] != session.get("role"):
            session.clear()
            return jsonify({
                "error": "Session is no longer valid"
            }), 401

        return jsonify({
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


# =====================================================
# API 6: LOGOUT
# =====================================================

@app.route("/api/auth/logout", methods=["POST"])
@login_required
def logout():
    session.clear()

    return jsonify({
        "message": "Logged out successfully"
    }), 200


# =====================================================
# API 7: STUDENT DASHBOARD
# =====================================================

@app.route("/api/student/dashboard", methods=["GET"])
@role_required("student")
def student_dashboard():
    return jsonify({
        "message": "Welcome to the Student Dashboard",
        "role": "student"
    }), 200


# =====================================================
# API 8: COMPANY DASHBOARD
# =====================================================

@app.route("/api/company/dashboard", methods=["GET"])
@role_required("company")
def company_dashboard():
    return jsonify({
        "message": "Welcome to the Company Dashboard",
        "role": "company"
    }), 200


# =====================================================
# API 9: CREATE OPPORTUNITY
# =====================================================

@app.route("/api/opportunities", methods=["POST"])
@role_required("company")
def create_opportunity():
    data = request.get_json(silent=True)
    values, error = validate_opportunity(data)

    if error:
        return jsonify({"error": error}), 400

    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        if not company["is_approved"]:
            return jsonify({
                "error": "Company approval is required"
            }), 403

        inserted_id = insert_and_get_id(connection, """
            INSERT INTO opportunities (
                company_id,
                title,
                description,
                opportunity_type,
                location,
                deadline,
                status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            company["id"],
            values["title"],
            values["description"],
            values["opportunity_type"],
            values["location"],
            values["deadline"],
            values["status"]
        ))

        opportunity_id = inserted_id
        connection.commit()

        opportunity = execute_query(connection, """
            SELECT *
            FROM opportunities
            WHERE id = ?
        """, (opportunity_id,)).fetchone()

        return jsonify({
            "message": "Opportunity created successfully",
            "opportunity": serialize_row(opportunity)
        }), 201

    finally:
        connection.close()


# =====================================================
# API 10: COMPANY OPPORTUNITIES
# =====================================================

@app.route("/api/company/opportunities", methods=["GET"])
@role_required("company")
def company_opportunities():
    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        rows = execute_query(connection, """
            SELECT *
            FROM opportunities
            WHERE company_id = ?
            ORDER BY created_at DESC, id DESC
        """, (company["id"],)).fetchall()

        return jsonify({
            "opportunities": [serialize_row(row) for row in rows]
        }), 200

    finally:
        connection.close()


# =====================================================
# API 11: GET SINGLE OPPORTUNITY
# =====================================================

@app.route("/api/opportunities/<int:opportunity_id>", methods=["GET"])
def get_single_opportunity(opportunity_id):
    connection = get_db_connection()

    try:
        opportunity = execute_query(connection, """
            SELECT
                o.*,
                c.company_name,
                c.user_id AS owner_user_id,
                c.is_approved
            FROM opportunities o
            JOIN companies c ON o.company_id = c.id
            WHERE o.id = ?
        """, (opportunity_id,)).fetchone()

        if opportunity is None:
            return jsonify({
                "error": "Opportunity not found"
            }), 404

        is_owner = (
            session.get("user_id") ==
            opportunity["owner_user_id"]
        )

        is_public = (
            opportunity["is_approved"] == 1
            and opportunity["status"] == "open"
            and (
                opportunity["deadline"] is None
                or str(opportunity["deadline"]) >= date.today().isoformat()
            )
        )

        if not is_public and not is_owner:
            return jsonify({
                "error": "Opportunity not found"
            }), 404

        result = serialize_row(opportunity)
        result.pop("owner_user_id")
        result.pop("is_approved")

        return jsonify({
            "opportunity": result
        }), 200

    finally:
        connection.close()


# =====================================================
# API 12: UPDATE OPPORTUNITY
# =====================================================

@app.route("/api/opportunities/<int:opportunity_id>", methods=["PUT"])
@role_required("company")
def update_opportunity(opportunity_id):
    data = request.get_json(silent=True)
    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        opportunity = execute_query(connection, """
            SELECT *
            FROM opportunities
            WHERE id = ?
        """, (opportunity_id,)).fetchone()

        if opportunity is None:
            return jsonify({
                "error": "Opportunity not found"
            }), 404

        if opportunity["company_id"] != company["id"]:
            return jsonify({
                "error": "You do not own this opportunity"
            }), 403

        if not company["is_approved"]:
            return jsonify({
                "error": "Company approval is required"
            }), 403

        values, error = validate_opportunity(
            data,
            existing=opportunity
        )

        if error:
            return jsonify({"error": error}), 400

        execute_query(connection, """
            UPDATE opportunities
            SET
                title = ?,
                description = ?,
                opportunity_type = ?,
                location = ?,
                deadline = ?,
                status = ?
            WHERE id = ?
              AND company_id = ?
        """, (
            values["title"],
            values["description"],
            values["opportunity_type"],
            values["location"],
            values["deadline"],
            values["status"],
            opportunity_id,
            company["id"]
        ))

        connection.commit()

        updated = execute_query(connection, """
            SELECT *
            FROM opportunities
            WHERE id = ?
        """, (opportunity_id,)).fetchone()

        return jsonify({
            "message": "Opportunity updated successfully",
            "opportunity": serialize_row(updated)
        }), 200

    finally:
        connection.close()


# =====================================================
# API 13: DELETE OPPORTUNITY
# =====================================================

@app.route("/api/opportunities/<int:opportunity_id>", methods=["DELETE"])
@role_required("company")
def delete_opportunity(opportunity_id):
    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        opportunity = execute_query(connection, """
            SELECT id, company_id
            FROM opportunities
            WHERE id = ?
        """, (opportunity_id,)).fetchone()

        if opportunity is None:
            return jsonify({
                "error": "Opportunity not found"
            }), 404

        if opportunity["company_id"] != company["id"]:
            return jsonify({
                "error": "You do not own this opportunity"
            }), 403

        if not company["is_approved"]:
            return jsonify({
                "error": "Company approval is required"
            }), 403

        application_count = execute_query(connection, """
            SELECT COUNT(*) AS total
            FROM applications
            WHERE opportunity_id = ?
        """, (opportunity_id,)).fetchone()["total"]

        if application_count > 0:
            return jsonify({
                "error": (
                    "Cannot delete an opportunity with applications. "
                    "Close the opportunity instead."
                )
            }), 409

        execute_query(connection, """
            DELETE FROM opportunities
            WHERE id = ?
              AND company_id = ?
        """, (opportunity_id, company["id"]))

        connection.commit()

        return "", 204

    finally:
        connection.close()


# =====================================================
# API 14: STUDENT APPLY FOR OPPORTUNITY
# =====================================================

@app.route("/api/opportunities/<int:opportunity_id>/apply", methods=["POST"])
@role_required("student")
def apply_for_opportunity(opportunity_id):
    connection = get_db_connection()

    try:
        student = execute_query(connection, """
            SELECT is_verified
            FROM users
            WHERE id = ?
              AND role = 'student'
        """, (session["user_id"],)).fetchone()

        if student is None or student["is_verified"] != 1:
            return jsonify({
                "error": "Your student account must be verified by an administrator before applying."
            }), 403

        opportunity = execute_query(connection, """
            SELECT o.id
            FROM opportunities o
            JOIN companies c ON o.company_id = c.id
            WHERE o.id = ?
              AND o.status = 'open'
              AND c.is_approved = 1
              AND (
                  o.deadline IS NULL
                  OR o.deadline >= DATE('now')
              )
        """, (opportunity_id,)).fetchone()

        if opportunity is None:
            return jsonify({
                "error": "Opportunity is unavailable or closed"
            }), 404

        existing_application = execute_query(connection, """
            SELECT id
            FROM applications
            WHERE student_id = ?
              AND opportunity_id = ?
        """, (
            session["user_id"],
            opportunity_id
        )).fetchone()

        if existing_application:
            return jsonify({
                "error": "You have already applied for this opportunity"
            }), 409

        inserted_id = insert_and_get_id(connection, """
            INSERT INTO applications (
                student_id,
                opportunity_id,
                status
            )
            VALUES (?, ?, 'submitted')
        """, (
            session["user_id"],
            opportunity_id
        ))

        connection.commit()

        return jsonify({
            "message": "Application submitted successfully",
            "application": {
                "id": inserted_id,
                "student_id": session["user_id"],
                "opportunity_id": opportunity_id,
                "status": "submitted"
            }
        }), 201

    except INTEGRITY_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Application already exists or is invalid"
        }), 409

    finally:
        connection.close()


# =====================================================
# API 15: STUDENT APPLICATION HISTORY
# =====================================================

@app.route("/api/student/applications", methods=["GET"])
@role_required("student")
def get_student_applications():
    connection = get_db_connection()

    try:
        rows = execute_query(connection, """
            SELECT
                a.id,
                a.student_id,
                a.opportunity_id,
                a.status,
                a.applied_at,
                o.title,
                o.opportunity_type,
                o.location,
                c.company_name
            FROM applications a
            JOIN opportunities o
                ON a.opportunity_id = o.id
            JOIN companies c
                ON o.company_id = c.id
            WHERE a.student_id = ?
            ORDER BY a.applied_at DESC, a.id DESC
        """, (session["user_id"],)).fetchall()

        applications = [serialize_row(row) for row in rows]

        pending_statuses = {
            "submitted",
            "pending",
            "under_review"
        }

        return jsonify({
            "applications": applications,
            "total": len(applications),
            "pending": sum(
                1 for application in applications
                if application["status"] in pending_statuses
            )
        }), 200

    finally:
        connection.close()


# =====================================================
# START DEVELOPMENT SERVER
# =====================================================

# =====================================================
# API 16: COMPANY VIEW APPLICATIONS
# =====================================================

@app.route("/api/company/applications", methods=["GET"])
@role_required("company")
def get_company_applications():
    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        rows = execute_query(connection, """
            SELECT
                a.id,
                a.student_id,
                a.opportunity_id,
                a.status,
                a.applied_at,
                u.full_name AS student_name,
                u.email AS student_email,
                o.title AS opportunity_title
            FROM applications a
            JOIN users u ON a.student_id = u.id
            JOIN opportunities o ON a.opportunity_id = o.id
            WHERE o.company_id = ?
            ORDER BY a.applied_at DESC, a.id DESC
        """, (company["id"],)).fetchall()

        applications = [serialize_row(row) for row in rows]

        return jsonify({
            "applications": applications,
            "total": len(applications),
            "pending": sum(
                1 for application in applications
                if application["status"] in (
                    "submitted",
                    "pending",
                    "under_review"
                )
            )
        }), 200

    finally:
        connection.close()


# =====================================================
# API 17: COMPANY UPDATE APPLICATION STATUS
# =====================================================

@app.route("/api/applications/<int:application_id>", methods=["PATCH"])
@role_required("company")
def update_application_status(application_id):
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required"
        }), 400

    status = data.get("status")

    allowed_statuses = {
        "submitted",
        "under_review",
        "accepted",
        "rejected"
    }

    if status not in allowed_statuses:
        return jsonify({
            "error": "Invalid application status"
        }), 400

    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        application = execute_query(connection, """
            SELECT a.id, a.status
            FROM applications a
            JOIN opportunities o ON a.opportunity_id = o.id
            WHERE a.id = ?
              AND o.company_id = ?
        """, (
            application_id,
            company["id"]
        )).fetchone()

        if application is None:
            return jsonify({
                "error": "Application not found"
            }), 404

        if not company["is_approved"]:
            return jsonify({
                "error": "Company approval is required"
            }), 403

        execute_query(connection, """
            UPDATE applications
            SET status = ?
            WHERE id = ?
        """, (status, application_id))

        connection.commit()

        return jsonify({
            "message": "Application status updated successfully",
            "application": {
                "id": application_id,
                "status": status
            }
        }), 200

    finally:
        connection.close()

        # =====================================================
# START DEVELOPMENT SERVER
# =====================================================




# =====================================================
# ADMIN REST API
# =====================================================


# API 18: ADMIN DASHBOARD


@app.route("/api/admin/dashboard", methods=["GET"])
@role_required("admin")
def admin_dashboard():
    connection = get_db_connection()


    try:
        queries = {
            "total_students": """
                SELECT COUNT(*) AS total FROM users
                WHERE role = 'student'
            """,
            "verified_students": """
                SELECT COUNT(*) AS total FROM users
                WHERE role = 'student' AND is_verified = 1
            """,
            "total_companies": """
                SELECT COUNT(*) AS total FROM companies
            """,
            "approved_companies": """
                SELECT COUNT(*) AS total FROM companies
                WHERE is_approved = 1
            """,
            "pending_companies": """
                SELECT COUNT(*) AS total FROM companies
                WHERE is_approved = 0
            """,
            "total_opportunities": """
                SELECT COUNT(*) AS total FROM opportunities
            """,
            "open_opportunities": """
                SELECT COUNT(*) AS total FROM opportunities
                WHERE status = 'open'
            """,
            "total_applications": """
                SELECT COUNT(*) AS total FROM applications
            """
        }


        stats = {}


        for key, query in queries.items():
            stats[key] = execute_query(
                connection, query
            ).fetchone()["total"]


        return jsonify({"statistics": stats}), 200


    finally:
        connection.close()




# API 19: LIST COMPANIES


@app.route("/api/admin/companies", methods=["GET"])
@role_required("admin")
def admin_companies():
    connection = get_db_connection()


    try:
        rows = execute_query(connection, """
            SELECT
                c.id,
                c.company_name,
                c.description,
                c.is_approved,
                u.full_name,
                u.email,
                u.created_at
            FROM companies c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.id DESC
        """).fetchall()


        return jsonify({
            "companies": [serialize_row(row) for row in rows]
        }), 200


    finally:
        connection.close()




# API 20: COMPANY APPROVAL


@app.route(
    "/api/admin/companies/<int:company_id>/approval",
    methods=["PATCH"]
)
@role_required("admin")
def admin_company_approval(company_id):
    data = request.get_json(silent=True)


    if not isinstance(data, dict):
        return jsonify({"error": "JSON object required"}), 400


    approved = data.get("is_approved")


    if type(approved) is not bool:
        return jsonify({
            "error": "is_approved must be true or false"
        }), 400


    connection = get_db_connection()


    try:
        cursor = execute_query(connection, """
            UPDATE companies
            SET is_approved = ?
            WHERE id = ?
        """, (int(approved), company_id))


        if cursor.rowcount == 0:
            connection.rollback()
            return jsonify({"error": "Company not found"}), 404


        connection.commit()


        return jsonify({
            "message": "Company approval updated successfully",
            "company": {
                "id": company_id,
                "is_approved": approved
            }
        }), 200


    finally:
        connection.close()




# API 21: LIST STUDENTS


@app.route("/api/admin/students", methods=["GET"])
@role_required("admin")
def admin_students():
    connection = get_db_connection()


    try:
        rows = execute_query(connection, """
            SELECT
                id,
                full_name,
                email,
                is_verified,
                created_at
            FROM users
            WHERE role = 'student'
            ORDER BY id DESC
        """).fetchall()


        return jsonify({
            "students": [serialize_row(row) for row in rows]
        }), 200


    finally:
        connection.close()




# API 22: STUDENT VERIFICATION


@app.route(
    "/api/admin/students/<int:student_id>/verification",
    methods=["PATCH"]
)
@role_required("admin")
def admin_student_verification(student_id):
    data = request.get_json(silent=True)


    if not isinstance(data, dict):
        return jsonify({"error": "JSON object required"}), 400


    verified = data.get("is_verified")


    if type(verified) is not bool:
        return jsonify({
            "error": "is_verified must be true or false"
        }), 400


    connection = get_db_connection()


    try:
        cursor = execute_query(connection, """
            UPDATE users
            SET is_verified = ?
            WHERE id = ? AND role = 'student'
        """, (int(verified), student_id))


        if cursor.rowcount == 0:
            connection.rollback()
            return jsonify({"error": "Student not found"}), 404


        connection.commit()


        return jsonify({
            "message": "Student verification updated successfully",
            "student": {
                "id": student_id,
                "is_verified": verified
            }
        }), 200


    finally:
        connection.close()




# API 23: MONITOR OPPORTUNITIES


@app.route("/api/admin/opportunities", methods=["GET"])
@role_required("admin")
def admin_opportunities():
    connection = get_db_connection()


    try:
        rows = execute_query(connection, """
            SELECT
                o.id,
                o.title,
                o.opportunity_type,
                o.location,
                o.deadline,
                o.status,
                o.created_at,
                c.company_name
            FROM opportunities o
            JOIN companies c ON o.company_id = c.id
            ORDER BY o.id DESC
        """).fetchall()


        return jsonify({
            "opportunities": [
                serialize_row(row) for row in rows
            ]
        }), 200


    finally:
        connection.close()




# API 24: MONITOR APPLICATIONS


@app.route("/api/admin/applications", methods=["GET"])
@role_required("admin")
def admin_applications():
    connection = get_db_connection()


    try:
        rows = execute_query(connection, """
            SELECT
                a.id,
                a.status,
                a.applied_at,
                u.full_name AS student_name,
                u.email AS student_email,
                o.title AS opportunity_title,
                c.company_name
            FROM applications a
            JOIN users u ON a.student_id = u.id
            JOIN opportunities o ON a.opportunity_id = o.id
            JOIN companies c ON o.company_id = c.id
            ORDER BY a.id DESC
        """).fetchall()


        return jsonify({
            "applications": [
                serialize_row(row) for row in rows
            ]
        }), 200


    finally:
        connection.close()





# =====================================================
# STUDENT PROFILE REST API
# =====================================================

STUDENT_PROFILE_FIELDS = {
    "student_number": 30,
    "college": 150,
    "degree_program": 150,
    "contact_number": 30,
    "bio": 2000,
    "skills": 2000,
    "qualifications": 3000
}


def read_student_profile(connection, user_id):
    return execute_query(connection, """
        SELECT
            u.id AS user_id,
            u.full_name,
            u.email,
            u.is_verified,
            p.student_number,
            p.college,
            p.degree_program,
            p.year_level,
            p.contact_number,
            p.bio,
            p.skills,
            p.qualifications,
            p.updated_at
        FROM users u
        LEFT JOIN student_profiles p
            ON p.user_id = u.id
        WHERE u.id = ?
          AND u.role = 'student'
    """, (user_id,)).fetchone()


# API 25: GET STUDENT PROFILE

@app.route("/api/student/profile", methods=["GET"])
@role_required("student")
def get_student_profile():
    connection = get_db_connection()

    try:
        profile = read_student_profile(
            connection,
            session["user_id"]
        )

        if profile is None:
            return jsonify({
                "error": "Student account not found"
            }), 404

        result = serialize_row(profile)
        result["is_verified"] = bool(result["is_verified"])

        return jsonify({
            "profile": result
        }), 200

    finally:
        connection.close()


# API 26: CREATE OR UPDATE STUDENT PROFILE

@app.route("/api/student/profile", methods=["PUT"])
@role_required("student")
def update_student_profile():
    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({
            "error": "A JSON object is required"
        }), 400

    allowed_fields = set(STUDENT_PROFILE_FIELDS) | {"year_level"}

    if set(data) - allowed_fields:
        return jsonify({
            "error": "Unsupported profile fields"
        }), 400

    if not data:
        return jsonify({
            "error": "Profile data is required"
        }), 400

    cleaned = {}

    for field, max_length in STUDENT_PROFILE_FIELDS.items():
        if field not in data:
            continue

        value = data[field]

        if value is None:
            cleaned[field] = None
            continue

        if not isinstance(value, str):
            return jsonify({
                "error": field + " must be text"
            }), 400

        value = value.strip()

        if len(value) > max_length or "\x00" in value:
            return jsonify({
                "error": "Invalid value for " + field
            }), 400

        cleaned[field] = value or None

    if "year_level" in data:
        year = data["year_level"]

        if year is not None:
            if type(year) is not int or not 1 <= year <= 6:
                return jsonify({
                    "error": "Year level must be between 1 and 6"
                }), 400

        cleaned["year_level"] = year

    connection = get_db_connection()

    try:
        user_id = session["user_id"]

        execute_query(connection, """
            INSERT INTO student_profiles (user_id)
            VALUES (?)
            ON CONFLICT (user_id) DO NOTHING
        """, (user_id,))

        fields = list(cleaned.keys())

        assignments = ", ".join(
            field + " = ?" for field in fields
        )

        query = (
            "UPDATE student_profiles SET "
            + assignments
            + ", updated_at = CURRENT_TIMESTAMP "
            + "WHERE user_id = ?"
        )

        values = [cleaned[field] for field in fields]
        values.append(user_id)

        execute_query(connection, query, tuple(values))

        profile = read_student_profile(connection, user_id)

        if profile is None:
            connection.rollback()
            return jsonify({
                "error": "Student account not found"
            }), 404

        result = serialize_row(profile)
        result["is_verified"] = bool(result["is_verified"])

        connection.commit()

        return jsonify({
            "message": "Student profile saved successfully",
            "profile": result
        }), 200

    except INTEGRITY_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Profile conflicts with an existing record"
        }), 409

    except DATABASE_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Unable to save student profile"
        }), 500

    finally:
        connection.close()



# =====================================================
# API 27: COMPANY VIEW APPLICANT STUDENT PROFILE
# =====================================================

@app.route(
    "/api/company/applications/<int:application_id>/student-profile",
    methods=["GET"]
)
@role_required("company")
def get_applicant_student_profile(application_id):
    connection = get_db_connection()

    try:
        company = get_company(connection)

        if company is None:
            return jsonify({
                "error": "Company profile not found"
            }), 404

        if not company["is_approved"]:
            return jsonify({
                "error": "Company approval is required"
            }), 403

        profile = execute_query(connection, """
            SELECT
                a.id AS application_id,
                a.status AS application_status,
                u.full_name,
                u.email,
                u.is_verified,
                o.title AS opportunity_title,
                p.college,
                p.degree_program,
                p.year_level,
                p.bio,
                p.skills,
                p.qualifications,
                p.updated_at
            FROM applications a
            JOIN opportunities o
                ON a.opportunity_id = o.id
            JOIN users u
                ON a.student_id = u.id
            LEFT JOIN student_profiles p
                ON p.user_id = u.id
            WHERE a.id = ?
              AND o.company_id = ?
              AND u.role = 'student'
        """, (
            application_id,
            company["id"]
        )).fetchone()

        if profile is None:
            return jsonify({
                "error": "Application not found"
            }), 404

        result = serialize_row(profile)
        result["is_verified"] = bool(result["is_verified"])

        return jsonify({
            "profile": result
        }), 200

    finally:
        connection.close()



# =====================================================
# RESUME CONFIGURATION AND SECURITY HELPERS
# =====================================================

MAX_RESUME_SIZE = 2 * 1024 * 1024
MAX_RESUME_REQUEST_SIZE = 3 * 1024 * 1024
MAX_RESUME_PAGES = 30


@app.before_request
def limit_resume_upload_request():
    if (
        request.path == "/api/student/resume"
        and request.method == "PUT"
    ):
        request.max_content_length = MAX_RESUME_REQUEST_SIZE

        if (
            request.content_length is not None
            and request.content_length > MAX_RESUME_REQUEST_SIZE
        ):
            return jsonify({
                "error": "Upload request is too large"
            }), 413


@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(error):
    return jsonify({
        "error": "Upload request is too large"
    }), 413


@app.after_request
def protect_resume_responses(response):
    if (
        request.path.startswith("/api/student/resume")
        or (
            request.path.startswith("/api/company/applications/")
            and "/resume" in request.path
        )
    ):
        response.headers["Cache-Control"] = "private, no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"

    return response


def validate_resume_upload(upload):
    if upload is None or not upload.filename:
        return None, "A PDF resume is required", 400

    filename = secure_filename(upload.filename)

    if (
        not filename
        or len(filename) > 255
        or not filename.lower().endswith(".pdf")
    ):
        return None, "Only PDF files are allowed", 400

    if upload.mimetype != "application/pdf":
        return None, "Invalid PDF content type", 415

    file_data = upload.stream.read(MAX_RESUME_SIZE + 1)
    file_size = len(file_data)

    if file_size == 0:
        return None, "The uploaded file is empty", 400

    if file_size > MAX_RESUME_SIZE:
        return None, "Resume must not exceed 2 MB", 413

    if not file_data.startswith(b"%PDF-"):
        return None, "Invalid PDF file signature", 400

    try:
        reader = PdfReader(BytesIO(file_data), strict=True)

        if reader.is_encrypted:
            return None, "Encrypted PDFs are not allowed", 400

        page_count = len(reader.pages)

        if not 1 <= page_count <= MAX_RESUME_PAGES:
            return None, "Resume must contain 1 to 30 pages", 400

    except Exception:
        return None, "Invalid or unreadable PDF document", 400

    return {
        "file_name": filename,
        "mime_type": "application/pdf",
        "file_size": file_size,
        "file_data": file_data
    }, None, None


def get_resume_metadata(connection, user_id):
    row = execute_query(connection, """
        SELECT
            file_name,
            mime_type,
            file_size,
            uploaded_at,
            updated_at
        FROM student_resumes
        WHERE user_id = ?
    """, (user_id,)).fetchone()

    return serialize_row(row) if row is not None else None


def create_resume_download(row):
    response = send_file(
        BytesIO(bytes(row["file_data"])),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=row["file_name"],
        conditional=False,
        etag=False,
        max_age=0
    )

    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"

    return response



# =====================================================
# API 28: GET STUDENT RESUME METADATA
# =====================================================

@app.route("/api/student/resume", methods=["GET"])
@role_required("student")
def get_student_resume():
    connection = get_db_connection()

    try:
        resume = get_resume_metadata(
            connection,
            session["user_id"]
        )

        return jsonify({
            "resume": resume
        }), 200

    finally:
        connection.close()


# =====================================================
# API 29: UPLOAD OR REPLACE STUDENT RESUME
# =====================================================

@app.route("/api/student/resume", methods=["PUT"])
@role_required("student")
def upload_student_resume():
    if request.mimetype != "multipart/form-data":
        return jsonify({
            "error": "Multipart form data is required"
        }), 415

    if len(request.files.getlist("resume")) != 1:
        return jsonify({
            "error": "Exactly one resume file is required"
        }), 400

    upload = request.files.get("resume")

    values, error, status = validate_resume_upload(upload)

    if error:
        return jsonify({
            "error": error
        }), status

    user_id = session["user_id"]
    connection = get_db_connection()

    try:
        execute_query(connection, """
            INSERT INTO student_resumes (
                user_id,
                file_name,
                mime_type,
                file_size,
                file_data
            )
            VALUES (?, ?, ?, ?, ?)

            ON CONFLICT (user_id) DO UPDATE SET
                file_name = excluded.file_name,
                mime_type = excluded.mime_type,
                file_size = excluded.file_size,
                file_data = excluded.file_data,
                updated_at = CURRENT_TIMESTAMP
        """, (
            user_id,
            values["file_name"],
            values["mime_type"],
            values["file_size"],
            values["file_data"]
        ))

        resume = get_resume_metadata(
            connection,
            user_id
        )

        connection.commit()

        return jsonify({
            "message": "Resume saved successfully",
            "resume": resume
        }), 200

    except DATABASE_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Unable to save resume"
        }), 500

    finally:
        connection.close()


# =====================================================
# API 30: DOWNLOAD STUDENT RESUME
# =====================================================

@app.route(
    "/api/student/resume/download",
    methods=["GET"]
)
@role_required("student")
def download_student_resume():
    connection = get_db_connection()

    try:
        resume = execute_query(connection, """
            SELECT file_name, file_data
            FROM student_resumes
            WHERE user_id = ?
        """, (session["user_id"],)).fetchone()

        if resume is None:
            return jsonify({
                "error": "Resume not found"
            }), 404

        return create_resume_download(resume)

    finally:
        connection.close()


# =====================================================
# API 31: DELETE STUDENT RESUME
# =====================================================

@app.route("/api/student/resume", methods=["DELETE"])
@role_required("student")
def delete_student_resume():
    connection = get_db_connection()

    try:
        cursor = execute_query(connection, """
            DELETE FROM student_resumes
            WHERE user_id = ?
        """, (session["user_id"],))

        if cursor.rowcount == 0:
            connection.rollback()

            return jsonify({
                "error": "Resume not found"
            }), 404

        connection.commit()

        return jsonify({
            "message": "Resume deleted successfully"
        }), 200

    except DATABASE_ERRORS:
        connection.rollback()

        return jsonify({
            "error": "Unable to delete resume"
        }), 500

    finally:
        connection.close()



# =====================================================
# COMPANY APPLICANT RESUME AUTHORIZATION
# =====================================================

def get_authorized_resume_applicant(connection, application_id):
    company = get_company(connection)

    if company is None:
        return None, "Company profile not found", 404

    if not company["is_approved"]:
        return None, "Company approval is required", 403

    applicant = execute_query(connection, """
        SELECT
            a.student_id
        FROM applications a
        JOIN opportunities o
            ON a.opportunity_id = o.id
        JOIN users u
            ON a.student_id = u.id
        WHERE a.id = ?
          AND o.company_id = ?
          AND u.role = 'student'
    """, (
        application_id,
        company["id"]
    )).fetchone()

    if applicant is None:
        return None, "Application not found", 404

    return applicant["student_id"], None, None


# =====================================================
# API 32: GET APPLICANT RESUME METADATA
# =====================================================

@app.route(
    "/api/company/applications/<int:application_id>/resume",
    methods=["GET"]
)
@role_required("company")
def get_applicant_resume(application_id):
    connection = get_db_connection()

    try:
        student_id, error, status = (
            get_authorized_resume_applicant(
                connection,
                application_id
            )
        )

        if error:
            return jsonify({
                "error": error
            }), status

        resume = get_resume_metadata(
            connection,
            student_id
        )

        return jsonify({
            "resume": resume
        }), 200

    except DATABASE_ERRORS:
        return jsonify({
            "error": "Unable to retrieve applicant resume"
        }), 500

    finally:
        connection.close()


# =====================================================
# API 33: DOWNLOAD APPLICANT RESUME
# =====================================================

@app.route(
    "/api/company/applications/<int:application_id>/resume/download",
    methods=["GET"]
)
@role_required("company")
def download_applicant_resume(application_id):
    connection = get_db_connection()

    try:
        student_id, error, status = (
            get_authorized_resume_applicant(
                connection,
                application_id
            )
        )

        if error:
            return jsonify({
                "error": error
            }), status

        resume = execute_query(connection, """
            SELECT file_name, file_data
            FROM student_resumes
            WHERE user_id = ?
        """, (student_id,)).fetchone()

        if resume is None:
            return jsonify({
                "error": "Applicant resume not found"
            }), 404

        return create_resume_download(resume)

    except DATABASE_ERRORS:
        return jsonify({
            "error": "Unable to download applicant resume"
        }), 500

    finally:
        connection.close()


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False)