import os
import subprocess
import threading
import json
import re
import shutil # Library untuk menghapus direktori secara aman
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from queue import Queue

# Inisialisasi aplikasi Flask
app = Flask(__name__, static_folder='build', static_url_path='/')
CORS(app)

# =================================================================
# Konfigurasi & Variabel Global
# =================================================================
DB_FILE = 'details_database.json'
PUBKEY = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC+fpCtuUy4J+VQBYvUGDqusj0PGgIKtTmaVMmqHDYdp2spvxat7Rlh/NOefnUqjlUrx7uAgd6gX0ip23bBpTTJa5vvqNNiRtxkqc068yDjaIG1XqZODFlW7uucrfCHeNNxNQTj1hW1CJBVZL4tnxWPP8BQfzxfWQJFmroglvHpTJVXcpbjvrpPrRiypit2u2KWi8xR8dVR/Qf0kndEZHSwW7Ivd0VvgM7DHaxLPjUe0XId4VALIXQKPt6EF88wgc+3uSQOqyYvrpzw+g9QpvJLX/qB7Fwh+9D6tCdQlhIofKi9MeEXMycx9ElqjZ8Z67s+xWxXFlbiyPpjvW7YA0ag78NUMf2KnE8OuY33mO5XZBR9RIpKZ9MkPdZsEW4StqBl5+LbtwcCvSti0ZgZpndXTvaXgd0jvuRyQ2i9yvkYqReI7Ulf8t8TXXetfbckn0tPd7HKunspdtM7RvqiOlwfySGyIdWI7huAuXV60D0qRg3s8HJl7OuQHmkQnS+748= root@qeveria"
log_queues = {}
HOME_DIR = os.path.expanduser('~')
WORK_DIR = os.path.join(HOME_DIR, 'workdir', 'terraform-for-lab')


# =================================================================
# Fungsi Helper (Pembantu)
# =================================================================
def load_details_db():
    if not os.path.exists(DB_FILE): return {}
    with open(DB_FILE, 'r') as f:
        try: return json.load(f)
        except json.JSONDecodeError: return {}

def save_details_db(db):
    with open(DB_FILE, 'w') as f: json.dump(db, f, indent=4)

def get_all_vm_names():
    """Menjalankan virsh dan mengembalikan sebuah set berisi semua nama VM yang ada."""
    try:
        result = subprocess.run(['virsh', 'list', '--all', '--name'], capture_output=True, text=True, check=True)
        return set(filter(None, result.stdout.strip().split('\n')))
    except:
        return set()

def stream_command(q_name, command, cwd):
    """Fungsi inti untuk menjalankan satu perintah dan streaming outputnya."""
    q = log_queues.get(q_name)
    q.put({'type': 'COMMAND', 'data': f"\n$ cd {cwd}\n$ {' '.join(command)}\n"})
    process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stderr_output = []
    # Baca stdout dan stderr secara real-time
    for line in iter(process.stdout.readline, ''): q.put({'type': 'STDOUT', 'data': line})
    for line in iter(process.stderr.readline, ''):
        stderr_output.append(line)
        q.put({'type': 'STDERR', 'data': line})
    process.stdout.close(); process.stderr.close()
    return_code = process.wait()
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command, output="".join(stderr_output))

# =================================================================
# Definisi API Endpoints
# =================================================================

@app.route('/api/os-images')
def get_os_images():
    try:
        image_dir = '/data/isos'
        images = [f for f in os.listdir(image_dir) if f.endswith('.img')]
        return jsonify(images)
    except Exception as e:
        return jsonify({"message": "Gagal mengambil daftar OS image", "error": str(e)}), 500

@app.route('/api/instances')
def get_instances():
    try:
        details_db = load_details_db()
        result = subprocess.run(['virsh', 'list', '--all'], capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')
        instances = []
        for line in lines[2:]:
            if not line.strip(): continue
            parts = line.strip().split()
            name = parts[1]
            instance_details = details_db.get(name, {})
            instance = { 'id': parts[0], 'name': name, 'state': ' '.join(parts[2:]), 'ip': instance_details.get('ip', '-') }
            instances.append(instance)
        return jsonify(instances)
    except Exception as e:
        return jsonify({"message": "Gagal mengambil daftar instance", "error": str(e)}), 500

@app.route('/api/instances/<hostname>')
def get_instance_details(hostname):
    try:
        details_db = load_details_db()
        vm_details = details_db.get(hostname, {})
        dominfo_raw = subprocess.run(['virsh', 'dominfo', hostname], capture_output=True, text=True).stdout
        vcpu_match = re.search(r'CPU\(s\):\s+(\d+)', dominfo_raw)
        memory_match = re.search(r'Max memory:\s+(\d+)\s+KiB', dominfo_raw)
        if vcpu_match: vm_details['cpu'] = vcpu_match.group(1)
        if memory_match: vm_details['memory'] = str(int(memory_match.group(1)) // 1024 // 1024)
        domblk_raw = subprocess.run(['virsh', 'domblklist', hostname], capture_output=True, text=True).stdout
        disk_match = re.search(r'vda\s+(.+)', domblk_raw)
        if disk_match: vm_details['disk_path'] = disk_match.group(1).strip()
        vm_details.setdefault('ip', '-'); vm_details.setdefault('os', '-'); vm_details.setdefault('clusterName', '-')
        return jsonify(vm_details)
    except Exception as e:
        return jsonify({"message": f"Gagal mengambil detail untuk {hostname}", "error": str(e)}), 500

@app.route('/api/instances/details', methods=['POST'])
def update_instance_details():
    data = request.json
    hostname, details_to_update = data.get('hostname'), data.get('details')
    if not hostname or not details_to_update: return jsonify({"message": "Hostname dan details dibutuhkan"}), 400
    try:
        db = load_details_db()
        if hostname not in db: db[hostname] = {}
        db[hostname].update(details_to_update)
        save_details_db(db)
        return jsonify({"message": f"Detail untuk {hostname} berhasil diperbarui."})
    except Exception as e:
        return jsonify({"message": "Gagal memperbarui detail", "error": str(e)}), 500

@app.route('/api/clusters')
def get_clusters():
    db = load_details_db()
    clusters = {}
    for hostname, details in db.items():
        cluster_name = details.get('clusterName', '-')
        if cluster_name == '-': continue
        if cluster_name not in clusters: clusters[cluster_name] = []
        clusters[cluster_name].append(hostname)
    cluster_list = [{"name": name, "instances": instances} for name, instances in clusters.items()]
    return jsonify(cluster_list)

@app.route('/api/instances/<hostname>/action', methods=['POST'])
def instance_action(hostname):
    action = request.json.get('action')
    valid_actions = ['start', 'shutdown', 'reboot']
    if not action in valid_actions:
        return jsonify({"message": "Aksi tidak valid."}), 400
    try:
        command = ['virsh', action, hostname]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return jsonify({"message": f"Instance {hostname} berhasil di-{action}.", "output": result.stdout})
    except subprocess.CalledProcessError as e:
        return jsonify({"message": f"Gagal melakukan aksi {action}", "error": e.stderr}), 500

# =================================================================
# Logika Proses (Create & Destroy)
# =================================================================

def run_creation_commands(name, vm_data_list, config_content, cluster_name):
    q = log_queues.get(name)
    if not q: return
    try:
        config_path = os.path.join(WORK_DIR, f"{name}.txt")
        q.put({'type': 'INFO', 'data': f"Menulis file konfigurasi ke {config_path}..."})
        with open(config_path, 'w') as f: f.write(config_content)
        
        stream_command(name, ['./not-tfgen.sh', name, f'{name}.txt'], cwd=WORK_DIR)
        
        terraform_dir = os.path.join(WORK_DIR, name)
        stream_command(name, ['terraform', 'init'], cwd=terraform_dir)
        stream_command(name, ['terraform', 'apply', '-auto-approve'], cwd=terraform_dir)
        
        db = load_details_db()
        for vm in vm_data_list:
            db[vm['hostname']] = { "ip": vm['ip'], "os": vm['os'], "cpu": vm['cpu'], "memory": vm['memory'], "disk": vm['disk'], "clusterName": cluster_name }
        save_details_db(db)
        q.put({'type': 'INFO', 'data': 'Detail berhasil disimpan.'})
    except subprocess.CalledProcessError as e:
        q.put({'type': 'ERROR', 'data': f"Perintah gagal dengan kode exit {e.returncode}."})
        q.put({'type': 'ERROR', 'data': f"Error Output:\n{e.output}"})
    except Exception as e:
        q.put({'type': 'ERROR', 'data': f"Terjadi kesalahan tak terduga: {str(e)}"})
    finally:
        q.put({'type': 'END', 'data': f"Proses untuk {name} selesai."})

def run_destroy_commands(name, is_cluster):
    log_key = f"destroy-{name}"
    q = log_queues.get(log_key)
    if not q: return
    try:
        resource_dir = os.path.join(WORK_DIR, name)
        config_file = os.path.join(WORK_DIR, f"{name}.txt")
        
        stream_command(log_key, ['terraform', 'destroy', '-auto-approve'], cwd=resource_dir)
        
        q.put({'type': 'INFO', 'data': f"Menghapus direktori {resource_dir}..."})
        if os.path.isdir(resource_dir): shutil.rmtree(resource_dir)
        
        q.put({'type': 'INFO', 'data': f"Menghapus file {config_file}..."})
        if os.path.exists(config_file): os.remove(config_file)
        
        db = load_details_db()
        if is_cluster:
            hostnames_to_delete = [h for h, d in db.items() if d.get('clusterName') == name]
            for h in hostnames_to_delete: del db[h]
        else:
            if name in db: del db[name]
        save_details_db(db)
        q.put({'type': 'INFO', 'data': 'Data dari database berhasil dihapus.'})
    except Exception as e:
        q.put({'type': 'ERROR', 'data': f"Terjadi kesalahan: {str(e)}"})
    finally:
        q.put({'type': 'END', 'data': f"Proses penghancuran untuk {name} selesai."})

# =================================================================
# Endpoint Create & Destroy
# =================================================================

@app.route('/api/clusters', methods=['POST'])
def create_cluster_endpoint():
    data = request.json
    cluster_name, instances = data.get('clusterName'), data.get('instances', [])
    if not cluster_name or not instances: return jsonify({"message": "Nama cluster dan minimal satu instance dibutuhkan."}), 400
    db = load_details_db()
    existing_vm_names = get_all_vm_names()
    for details in db.values():
        if details.get('clusterName') == cluster_name: return jsonify({"message": f"Nama cluster '{cluster_name}' sudah digunakan."}), 409
    for vm in instances:
        if vm['hostname'] in existing_vm_names: return jsonify({"message": f"Nama instance '{vm['hostname']}' sudah ada."}), 409
    file_content = f"[LAB]\nPUBKEY1: {PUBKEY}"
    for i, vm in enumerate(instances, 1):
        network = '.'.join(vm['ip'].split('.')[:3] + ['0'])
        file_content += f"\n\n[VM{i}]\nNAME: {vm['hostname']}\nOS: {vm['os']}\nNESTED: y\nVCPUS: {vm['cpu']}\nMEMORY: {vm['memory']}G\nDISK1: {vm['disk']}G\nIFACE_NETWORK1: {network}\nIFACE_IP1: {vm['ip']}\nCONSOLE: vnc"
    log_queues[cluster_name] = Queue()
    thread = threading.Thread(target=run_creation_commands, args=(cluster_name, instances, file_content.strip(), cluster_name))
    thread.start()
    return jsonify({"message": f"Proses pembuatan cluster {cluster_name} telah dimulai."}), 202

@app.route('/api/vms', methods=['POST'])
def create_vm():
    data = request.json
    hostname = data.get('hostname')
    if not all([data.get(k) for k in ['ip', 'hostname', 'os', 'cpu', 'memory', 'disk']]): return jsonify({"message": "Semua field harus diisi."}), 400
    existing_vm_names = get_all_vm_names()
    if hostname in existing_vm_names: return jsonify({"message": f"Nama instance '{hostname}' sudah ada."}), 409
    log_queues[hostname] = Queue()
    network = '.'.join(data['ip'].split('.')[:3] + ['0'])
    config_content = f"[LAB]\nPUBKEY1: {PUBKEY}\n\n[VM1]\nNAME: {data['hostname']}\nOS: {data['os']}\nNESTED: y\nVCPUS: {data['cpu']}\nMEMORY: {data['memory']}G\nDISK1: {data['disk']}G\nIFACE_NETWORK1: {network}\nIFACE_IP1: {data['ip']}\nCONSOLE: vnc".strip()
    thread = threading.Thread(target=run_creation_commands, args=(hostname, [data], config_content, '-'))
    thread.start()
    return jsonify({"message": f"Proses pembuatan untuk {hostname} telah dimulai."}), 202

@app.route('/api/instances/<hostname>', methods=['DELETE'])
def destroy_vm(hostname):
    log_key = f"destroy-{hostname}"
    log_queues[log_key] = Queue()
    thread = threading.Thread(target=run_destroy_commands, args=(hostname, False))
    thread.start()
    return jsonify({"message": "Proses penghancuran VM dimulai."}), 202

@app.route('/api/clusters/<cluster_name>', methods=['DELETE'])
def destroy_cluster(cluster_name):
    log_key = f"destroy-{cluster_name}"
    log_queues[log_key] = Queue()
    thread = threading.Thread(target=run_destroy_commands, args=(cluster_name, True))
    thread.start()
    return jsonify({"message": "Proses penghancuran cluster dimulai."}), 202

# =================================================================
# Endpoint Streaming Log & Serving Frontend
# =================================================================

@app.route('/api/logs/<log_key>')
def stream_logs(log_key):
    def generate():
        q = log_queues.get(log_key)
        if not q:
            yield f"data: {{\"type\": \"ERROR\", \"data\": \"Tidak ada proses yang berjalan untuk {log_key}\"}}\n\n"
            return
        while True:
            log_entry = q.get()
            import json
            yield f"data: {json.dumps(log_entry)}\n\n"
            if log_entry.get('type') == 'END': break
        if log_key in log_queues: del log_queues[log_key]
    return Response(stream_with_context(generate()), mimetype='text/event-stream')

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
    else:
        return app.send_static_file('index.html')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
