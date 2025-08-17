import os
import subprocess
import threading
import json
import re
import shutil
import time
from functools import wraps
from flask import Flask, request, jsonify, Response, stream_with_context, session, send_file
from flask_cors import CORS
from queue import Queue, Empty

# Inisialisasi aplikasi Flask
app = Flask(__name__, static_folder='build', static_url_path='/')
CORS(app, supports_credentials=True)

# =================================================================
# Konfigurasi & Variabel Global
# =================================================================

# PENTING: Ganti ini dengan string acak yang sangat rahasia!
# Anda bisa membuatnya di terminal python dengan:
# python3 -c 'import os; print(os.urandom(24).hex())'
app.config['SECRET_KEY'] = 'QY5QqR7diVqrHN5sj14CO'

# Kredensial Pengguna
USER_EMAIL = "opsculun@qeveria.co.id"
USER_PASSWORD = "Opsculun147"

log_queues = {}
HOME_DIR = os.path.expanduser('~')
WORK_DIR = os.path.join(HOME_DIR, 'workdir', 'terraform-for-lab')
DB_FILE = 'details_database.json'
PUBKEY = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC+fpCtuUy4J+VQBYvUGDqusj0PGgIKtTmaVMmqHDYdp2spvxat7Rlh/NOefnUqjlUrx7uAgd6gX0ip23bBpTTJa5vvqNNiRtxkqc068yDjaIG1XqZODFlW7uucrfCHeNNxNQTj1hW1CJBVZL4tnxWPP8BQfzxfWQJFmroglvHpTJVXcpbjvrpPrRiypit2u2KWi8xR8dVR/Qf0kndEZHSwW7Ivd0VvgM7DHaxLPjUe0XId4VALIXQKPt6EF88wgc+3uSQOqyYvrpzw+g9QpvJLX/qB7Fwh+9D6tCdQlhIofKi9MeEXMycx9ElqjZ8Z67s+xWxXFlbiyPpjvW7YA0ag78NUMf2KnE8OuY33mO5XZBR9RIpKZ9MkPdZs1EW4StqBl5+LbtwcCvSti0ZgZpndXTvaXgd0jvuRyQ2i9yvkYqReI7Ulf8t8TXXetfbckn0tPd7HKunspdtM7RvqiOlwfySGyIdWI7huAuXV60D0qRg3s8HJl7OuQHmkQnS+748= root@qeveria"

# =================================================================
# Dekorator Autentikasi
# =================================================================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('logged_in'):
            return jsonify({"message": "Akses ditolak, silahkan login."}), 401
        return f(*args, **kwargs)
    return decorated_function

# =================================================================
# Endpoint Autentikasi
# =================================================================

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')

    if email == USER_EMAIL and password == USER_PASSWORD:
        session['logged_in'] = True
        return jsonify({"message": "Login berhasil!"}), 200
    else:
        return jsonify({"message": "Email atau password salah."}), 401

@app.route('/api/check_auth')
def check_auth():
    if session.get('logged_in'):
        return jsonify({"isAuthenticated": True}), 200
    return jsonify({"isAuthenticated": False}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def logout():
    session.clear()
    return jsonify({"message": "Logout berhasil."}), 200

# =================================================================
# Salin semua endpoint API lama Anda ke sini dan tambahkan @login_required
# =================================================================

@app.route('/api/os-images')
@login_required
def get_os_images():
    try:
        image_dir = '/data/isos'
        images = [f for f in os.listdir(image_dir) if f.endswith('.img')]
        return jsonify(images)
    except Exception as e:
        return jsonify({"message": "Gagal mengambil daftar OS image", "error": str(e)}), 500

@app.route('/api/instances')
@login_required
def get_instances():
    # ... (kode get_instances Anda)
    pass

# ... Tambahkan @login_required ke semua endpoint lainnya ...
# /api/instances/<hostname>
# /api/instances/details
# /api/clusters
# /api/instances/<hostname>/action
# /api/tools/resize-vm
# /api/clusters (POST)
# /api/vms (POST)
# /api/instances/<hostname> (DELETE)
# /api/clusters/<cluster_name> (DELETE)


# =================================================================
# Endpoint Frontend
# =================================================================

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_file(os.path.join(app.static_folder, path))
    else:
        return send_file(os.path.join(app.static_folder, 'index.html'))
        
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)