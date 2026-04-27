from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import openstack
import json
import os
import re
from datetime import datetime
from functools import wraps

app = Flask(__name__)
app.secret_key = "super-secret-key-for-dev"

LOG_FILE = "audit.log"
MAX_INSTANCES = 2

VALID_USERS = {
    "student1": "password123",
    "student2": "password456"
}

USER_KEYPAIRS = {
    "student1": "student1-key",
    "student2": "student2-key"
}

# ---------------- SECURITY ----------------
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "username" not in session:
            if request.path.startswith("/api/"):
                return jsonify({"status": "error", "message": "Unauthorized"}), 401
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


# ---------------- LOGGING ----------------
def log_action(user, action, params, result, instance_id="N/A"):
    # Filter out extraneous keys like 'owner' from params for cleaner logs
    clean_params = {k: v for k, v in params.items() if k != "owner"}
    
    entry = {
        "timestamp": str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        "user": user,
        "action": action.capitalize(),
        "instance_id": instance_id,
        "result": result,
        "params": clean_params
    }

    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")


# ---------------- CONNECTION ----------------
def connect():
    return openstack.connect()


# ---------------- HELPERS ----------------
def extract_ip(addresses):
    if not addresses:
        return "N/A"

    for network_addresses in addresses.values():
        if network_addresses and len(network_addresses) > 0:
            return network_addresses[0].get("addr", "N/A")

    return "N/A"


def get_instances():
    conn = connect()
    servers = list(conn.compute.servers())

    current_user = session.get("username")

    instances = []
    for s in servers:
        # Isolate visibility to current user only
        metadata = s.metadata or {}
        if metadata.get("owner") == current_user:
            instances.append({
                "name": s.name,
                "status": s.status,
                "ip": extract_ip(s.addresses),
                "id": s.id
            })

    return instances


def get_resources():
    conn = connect()

    networks = [net.name for net in conn.network.networks()]
    images = [img.name for img in conn.compute.images()]
    flavors = [flv.name for flv in conn.compute.flavors()]
    keypairs = [kp.name for kp in conn.compute.keypairs()]

    return {
        "networks": networks,
        "images": images,
        "flavors": flavors,
        "keypairs": keypairs
    }


def create_vm(data):
    conn = connect()
    current_user = data.get("owner", session.get("username"))

    servers = list(conn.compute.servers())
    user_servers = [s for s in servers if (s.metadata or {}).get("owner") == current_user]
    
    if len(user_servers) >= MAX_INSTANCES:
        raise Exception(f"Instance limit reached (max {MAX_INSTANCES} per user)")

    # Validate resources
    net = conn.network.find_network(data["network"])
    if not net:
        raise Exception(f"Network '{data['network']}' not found")

    img = conn.compute.find_image(data["image"])
    if not img:
        raise Exception(f"Image '{data['image']}' not found")

    flv = conn.compute.find_flavor(data["flavor"])
    if not flv:
        raise Exception(f"Flavor '{data['flavor']}' not found")

    kp = conn.compute.find_keypair(data["key"])
    if not kp:
        raise Exception(f"Keypair '{data['key']}' not found")

    # Optional duplicate-name guard
    existing = conn.compute.find_server(data["name"])
    if existing:
        raise Exception(f"Instance '{data['name']}' already exists")

    server = conn.compute.create_server(
        name=data["name"],
        image_id=img.id,
        flavor_id=flv.id,
        networks=[{"uuid": net.id}],
        key_name=data["key"],
        metadata={"owner": current_user}
    )

    server = conn.compute.wait_for_server(server)

    return {
        "name": server.name,
        "status": server.status,
        "id": server.id
    }


def delete_vm(name):
    conn = connect()
    current_user = session.get("username")

    servers = list(conn.compute.servers())
    server = next((s for s in servers if s.name == name), None)
    
    if not server:
        raise Exception(f"Instance '{name}' not found")
        
    metadata = server.metadata or {}
    if metadata.get("owner") != current_user:
        raise Exception(f"Unauthorized: You do not own instance '{name}'")

    conn.compute.delete_server(server)

    return {"name": name, "id": server.id}


# ---------------- ROUTES ----------------
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        
        if username in VALID_USERS and VALID_USERS[username] == password:
            session["username"] = username
            return redirect(url_for("index"))
        
        return render_template("login.html", error="Invalid credentials. Please try again.")
        
    return render_template("login.html")

@app.route("/logout")
def logout():
    session.pop("username", None)
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    current_user = session.get("username")
    assigned_key = USER_KEYPAIRS.get(current_user, "N/A")
    return render_template("index.html", assigned_key=assigned_key)


@app.route("/api/instances", methods=["GET"])
@login_required
def api_instances():
    try:
        instances = get_instances()
        return jsonify({"instances": instances}), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to load instances: {str(e)}"
        }), 500


@app.route("/api/logs", methods=["GET"])
@login_required
def api_logs():
    try:
        logs = []
        current_user = session.get("username")
        
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, "r") as f:
                for line in f:
                    if line.strip():
                        entry = json.loads(line)
                        if entry.get("user") == current_user:
                            logs.append(entry)
        # Reverse the list so the newest logs appear first
        logs.reverse()
        return jsonify({"logs": logs}), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to load logs: {str(e)}"
        }), 500


@app.route("/api/resources", methods=["GET"])
@login_required
def api_resources():
    try:
        resources = get_resources()
        # Return assigned keypair
        return jsonify({
            "networks": resources["networks"],
            "images": resources["images"],
            "flavors": resources["flavors"],
            "assigned_key": USER_KEYPAIRS.get(session.get("username"), "N/A")
        }), 200
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to load resources: {str(e)}"
        }), 500


@app.route("/api/launch", methods=["POST"])
@login_required
def api_launch():
    data = request.get_json()

    # The keypair is determined on backend
    required_fields = ["name", "image", "flavor", "network"]
    for field in required_fields:
        if not data.get(field):
            return jsonify({
                "status": "error",
                "message": f"Missing required field: {field}"
            }), 400

    if not re.match(r"^[a-zA-Z0-9-]+$", data["name"]):
        return jsonify({
            "status": "error",
            "message": "Invalid instance name. Please use only letters, numbers, and hyphens."
        }), 400

    try:
        # Secure the launch payload with hardcoded user keypair mapping
        data["key"] = USER_KEYPAIRS[session["username"]]
        # Let openstack know the metadata for isolation later
        data["owner"] = session["username"]

        vm = create_vm(data)

        log_action(
            user=session["username"],
            action="Create",
            params=data,
            result="success",
            instance_id=vm["id"]
        )

        return jsonify({
            "status": "success",
            "message": f"VM '{vm['name']}' created successfully.",
            "vm": vm
        }), 200

    except Exception as e:
        log_action(
            user=session["username"],
            action="Create",
            params=data,
            result=f"fail: {str(e)}"
        )

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


@app.route("/api/delete", methods=["POST"])
@login_required
def api_delete():
    data = request.get_json()

    if not data or not data.get("name"):
        return jsonify({
            "status": "error",
            "message": "Missing required field: name"
        }), 400

    try:
        deleted = delete_vm(data["name"])

        log_action(
            user=session["username"],
            action="Delete",
            params=data,
            result="success",
            instance_id=deleted["id"]
        )

        return jsonify({
            "status": "success",
            "message": f"VM '{deleted['name']}' deleted successfully."
        }), 200

    except Exception as e:
        log_action(
            user=session["username"],
            action="Delete",
            params=data,
            result=f"fail: {str(e)}"
        )

        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500


if __name__ == "__main__":
    app.run(debug=True, port=8080)
