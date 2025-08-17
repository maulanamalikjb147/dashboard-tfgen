import os
import subprocess
import threading
import json
import re
import shutil
import time # Impor modul time
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from queue import Queue, Empty

# Inisialisasi aplikasi Flask
app = Flask(__name__, static_folder='build', static_url_path='/')
CORS(app)

# =================================================================
# Konfigurasi & Variabel Global
# =================================================================
DB_FILE = 'details_database.json'
PUBKEY = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC+fpCtuUy4J+VQBYvUGDqusj0PGgIKtTmaVMmqHDYdp2spvxat7Rlh/NOefnUqjlUrx7uAgd6gX0ip23bBpTTJa5vvqNNiRtxkqc068yDjaIG1XqZODFlW7uucrfCHeNNxNQTj1hW1CJBVZL4tnxWPP8BQfzxfWQJFmroglvHpTJVXcpbjvrpPrRiypit2u2KWi8xR8dVR/Qf0kndEZHSwW7Ivd0VvgM7DHaxLPjUe0XId4VALIXQKPt6EF88wgc+3uSQOqyYvrpzw+g9QpvJLX/qB7Fwh+9D6tCdQlhIofKi9MeEXMycx9ElqjZ8Z67s+xWxXFlbiyPpjvW7YA0ag78NUMf2KnE8OuY33mO5XZBR9RIpKZ9MkPdZs1EW4StqBl5+LbtwcCvSti0ZgZpndXTvaXgd0jvuRyQ2i9yvkYqReI7Ulf8t8TXXetfbckn0tPd7HKunspdtM7RvqiOlwfySGyIdWI7huAuXV60D0qRg3s8HJl7OuQHmkQnS+748= root@qeveria"

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
    try:
        result = subprocess.run(['sudo', 'virsh', 'list', '--all', '--name'], capture_output=True, text=True, check=True)
        return set(filter(None, result.stdout.strip().split('\n')))
    except:
        return set()

def stream_command(q_name, command, cwd):
    q = log_queues.get(q_name)
    if not q:
        print(f"Antrean log '{q_name}' tidak ditemukan.")
        return

    q.put({'type': 'COMMAND', 'data': f"$ {' '.join(command)}\n"})
    
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1
    )

    def enqueue_output(pipe, log_type):
        try:
            for line in iter(pipe.readline, ''):
                q.put({'type': log_type, 'data': line})
        finally:
            pipe.close()

    stdout_thread = threading.Thread(target=enqueue_output, args=(process.stdout, 'STDOUT'))
    stderr_thread = threading.Thread(target=enqueue_output, args=(process.stderr, 'STDERR'))
    
    stdout_thread.start()
    stderr_thread.start()

    return_code = process.wait()

    stdout_thread.join()
    stderr_thread.join()
    
    if return_code != 0:
        raise subprocess.CalledProcessError(return_code, command)

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
        result = subprocess.run(['sudo', 'virsh', 'list', '--all'], capture_output=True, text=True, check=True)
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
        dominfo_raw = subprocess.run(['sudo','virsh', 'dominfo', hostname], capture_output=True, text=True).stdout
        vcpu_match = re.search(r'CPU\(s\):\s+(\d+)', dominfo_raw)
        memory_match = re.search(r'Max memory:\s+(\d+)\s+KiB', dominfo_raw)
        if vcpu_match: vm_details['cpu'] = vcpu_match.group(1)
        if memory_match: vm_details['memory'] = str(int(memory_match.group(1)) // 1024 // 1024)
        domblk_raw = subprocess.run(['sudo','virsh', 'domblklist', hostname], capture_output=True, text=True).stdout
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
        command = ['sudo','virsh', action, hostname]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        return jsonify({"message": f"Instance {hostname} berhasil di-{action}.", "output": result.stdout})
    except subprocess.CalledProcessError as e:
        return jsonify({"message": f"Gagal melakukan aksi {action}", "error": e.stderr}), 500

@app.route('/api/tools/resize-vm', methods=['POST'])
def resize_vm_endpoint():
    data = request.json
    hostname = data.get('hostname')
    ip_address = data.get('ip')
    if not hostname or not ip_address:
        return jsonify({"message": "Hostname dan IP address dibutuhkan"}), 400
    log_key = f"resize-{hostname}"
    log_queues[log_key] = Queue()
    thread = threading.Thread(target=run_resize_script, args=(log_key, hostname, ip_address))
    thread.start()
    return jsonify({"message": f"Proses resize untuk {hostname} telah dimulai."}), 202


# =================================================================
# Logika Proses (Create, Destroy, dan Resize)
# =================================================================
def run_creation_commands(name, vm_data_list, config_content, cluster_name):
    q = log_queues.get(name)
    if not q: return
    try:
        config_path = os.path.join(WORK_DIR, f"{name}.txt")
        q.put({'type': 'INFO', 'data': f"Menulis file konfigurasi ke {config_path}...\n"})
        with open(config_path, 'w') as f: f.write(config_content)
        
        stream_command(name, ['./not-tfgen.sh', name, f'{name}.txt'], cwd=WORK_DIR)
        
        terraform_dir = os.path.join(WORK_DIR, name)
        stream_command(name, ['terraform', 'init'], cwd=terraform_dir)
        stream_command(name, ['terraform', 'apply', '-auto-approve'], cwd=terraform_dir)
        
        db = load_details_db()
        for vm in vm_data_list:
            db[vm['hostname']] = { "ip": vm['ip'], "os": vm['os'], "cpu": vm['cpu'], "memory": vm['memory'], "disk": vm['disk'], "clusterName": cluster_name }
        save_details_db(db)
        q.put({'type': 'SUCCESS', 'data': 'Detail berhasil disimpan.\n'})
    except subprocess.CalledProcessError:
        q.put({'type': 'ERROR', 'data': f"Salah satu perintah gagal. Lihat log di atas untuk detail.\n"})
    except Exception as e:
        q.put({'type': 'ERROR', 'data': f"Terjadi kesalahan tak terduga: {str(e)}\n"})
    finally:
        q.put({'type': 'END', 'data': f"Proses untuk {name} selesai."})

def run_destroy_commands(name, is_cluster):
    log_key = f"destroy-{name}"
    q = log_queues.get(log_key)
    if not q: return
    try:
        resource_dir = os.path.join(WORK_DIR, name)
        config_file = os.path.join(WORK_DIR, f"{name}.txt")
        
        if not os.path.isdir(resource_dir):
            raise FileNotFoundError(f"Direktori Terraform untuk '{name}' tidak ditemukan.")

        stream_command(log_key, ['terraform', 'destroy', '-auto-approve'], cwd=resource_dir)
        
        q.put({'type': 'INFO', 'data': f"Menghapus direktori {resource_dir}...\n"})
        shutil.rmtree(resource_dir)
        
        q.put({'type': 'INFO', 'data': f"Menghapus file {config_file}...\n"})
        if os.path.exists(config_file): os.remove(config_file)
        
        db = load_details_db()
        if is_cluster:
            hostnames_to_delete = [h for h, d in db.items() if d.get('clusterName') == name]
            for h in hostnames_to_delete: del db[h]
        else:
            if name in db: del db[name]
        save_details_db(db)
        q.put({'type': 'SUCCESS', 'data': 'Data dari database berhasil dihapus.\n'})
    except subprocess.CalledProcessError:
        q.put({'type': 'ERROR', 'data': f"Perintah `terraform destroy` gagal.\n"})
    except Exception as e:
        q.put({'type': 'ERROR', 'data': f"Terjadi kesalahan: {str(e)}\n"})
    finally:
        q.put({'type': 'END', 'data': f"Proses penghancuran untuk {name} selesai."})


def run_resize_script(log_key, hostname, ip_address):
    q = log_queues.get(log_key)
    if not q: return
    
    script_content = f"""
#!/bin/bash
set -o pipefail
log() {{
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}}
log "Memulai proses resize untuk {hostname}"
INSTANCE_NAME="{hostname}"
IP_INSTANCE="{ip_address}"
QCOW2_ORIGINAL="/data/vms/{hostname}-vda.qcow2"
QCOW2_BAK="/data/vms/{hostname}-vda.qcow2.compress"
QCOW2_TMP="/data/vms/{hostname}-vda.qcow2.original"
log "Mengecek status VM..."
STATE=$(virsh list --all | grep " $INSTANCE_NAME " | awk '{{print $3}}')
if [ "$STATE" == "running" ]; then
    log "VM sedang berjalan. Mencoba mematikan (shutdown)..."
    virsh shutdown $INSTANCE_NAME
    log "Menunggu VM benar-benar mati (maks. 2 menit)..."
    for i in {{1..24}}; do
        STATE=$(virsh list --all | grep " $INSTANCE_NAME " | awk '{{print $3}}')
        if [[ "$STATE" != "running" ]]; then
            log "VM berhasil dimatikan."
            break
        fi
        sleep 5
    done
    if [[ "$(virsh list --all | grep " $INSTANCE_NAME " | awk '{{print $3}}')" == "running" ]]; then
        log "VM gagal dimatikan dengan normal, mematikan paksa (destroy)..."
        virsh destroy $INSTANCE_NAME
    fi
else
    log "VM sudah dalam keadaan mati, melanjutkan proses."
fi
log "Langkah 3: Mengkonversi image qcow2..."
qemu-img convert -O qcow2 "$QCOW2_ORIGINAL" "$QCOW2_BAK"
if [ $? -ne 0 ]; then log "ERROR: qemu-img convert gagal."; exit 1; fi
log "Langkah 4: Mengganti file image..."
mv "$QCOW2_ORIGINAL" "$QCOW2_TMP"
if [ $? -ne 0 ]; then log "ERROR: Gagal memindahkan file original."; exit 1; fi
mv "$QCOW2_BAK" "$QCOW2_ORIGINAL"
if [ $? -ne 0 ]; then log "ERROR: Gagal memindahkan file baru."; mv "$QCOW2_TMP" "$QCOW2_ORIGINAL"; exit 1; fi
rm "$QCOW2_TMP"
log "Langkah 5: Menyalakan kembali VM..."
virsh start $INSTANCE_NAME
if [ $? -ne 0 ]; then log "ERROR: Gagal menyalakan kembali VM."; exit 1; fi
log "Menunggu VM boot (30 detik)..."
sleep 30
log "Langkah 6: Melakukan pemeriksaan kesehatan (SSH)..."
SUCCESS=false
for i in {{1..5}}; do
  log "Percobaan SSH ke $IP_INSTANCE... ($i/5)"
  if timeout 5 ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5 root@$IP_INSTANCE "echo OK"; then
    log "Koneksi SSH berhasil pada percobaan ke-$i."
    SUCCESS=true
    break
  fi
  log "Percobaan SSH ke-$i gagal, mencoba lagi..."
  sleep 2
done
if [ "$SUCCESS" = false ]; then
  log "ERROR: Pemeriksaan kesehatan SSH gagal setelah 5 percobaan."
  exit 1
fi
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
DURATION_STR=$(printf '%02d:%02d:%02d' $(($DURATION/3600)) $(($DURATION%3600/60)) $(($DURATION%60)))
SIZE=$(du -sh "$QCOW2_ORIGINAL" | awk '{{print $1}}')
MESSAGE="Instance $INSTANCE_NAME berhasil di-resize ✅%0ADuration: $DURATION_STR%0ATotal size instance: $SIZE"
log "Mengirim notifikasi ke Telegram..."
curl -s -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" -d chat_id="$CHAT_ID" -d text="$MESSAGE" > /dev/null
log "--- Proses resize selesai dengan SUKSES ---"
    """
    script_path = os.path.join(WORK_DIR, 'script-resize-vm.sh')
    try:
        q.put({'type': 'INFO', 'data': f"Membuat skrip resize di {script_path}...\n"})
        with open(script_path, 'w') as f: f.write(script_content)
        os.chmod(script_path, 0o755)
        q.put({'type': 'INFO', 'data': "Menjalankan skrip resize sebagai root...\n"})
        stream_command(log_key, ['sudo', 'bash', script_path], cwd=WORK_DIR)
        q.put({'type': 'SUCCESS', 'data': 'Skrip resize berhasil dijalankan.\n'})
    except subprocess.CalledProcessError:
        q.put({'type': 'ERROR', 'data': f"Eksekusi skrip gagal. Silakan periksa log di atas.\n"})
    except Exception as e:
        q.put({'type': 'ERROR', 'data': f"Terjadi kesalahan: {str(e)}\n"})
    finally:
        q.put({'type': 'END', 'data': f"Proses resize untuk {hostname} selesai."})

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

# --- FUNGSI INI DIPERBARUI UNTUK MENJADI LEBIH SABAR ---
@app.route('/api/logs/<log_key>')
def stream_logs(log_key):
    def generate():
        q = None
        # Tunggu hingga 5 detik sampai antrean log dibuat oleh thread lain
        for _ in range(50): # Coba 50 kali dengan jeda 0.1 detik
            q = log_queues.get(log_key)
            if q is not None:
                break
            time.sleep(0.1)

        if not q:
            yield f"data: {json.dumps({'type': 'ERROR', 'data': f'Proses untuk {log_key} gagal dimulai atau tidak ditemukan.'})}\n\n"
            yield f"data: {json.dumps({'type': 'END', 'data': 'Gagal terhubung ke log stream.'})}\n\n"
            return
        
        while True:
            try:
                log_entry = q.get(block=True) 
                yield f"data: {json.dumps(log_entry)}\n\n"
                if log_entry.get('type') == 'END':
                    break
            except Empty:
                continue
        
        if log_key in log_queues:
            del log_queues[log_key]

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
