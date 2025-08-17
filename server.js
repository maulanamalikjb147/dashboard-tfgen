// Import library yang dibutuhkan
const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const SSE = require('express-sse');

// Inisialisasi aplikasi Express
const app = express();
const port = process.env.PORT || 5000; 

// Inisialisasi Server-Sent Events
const sse = new SSE();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'build')));

// =================================================================
// Variabel Global dan Helper
// =================================================================
const HOME_DIR = process.env.HOME;
const WORK_DIR = path.join(HOME_DIR, 'workdir', 'terraform-for-lab');
const PUBKEY = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC+fpCtuUy4J+VQBYvUGDqusj0PGgIKtTmaVMmqHDYdp2spvxat7Rlh/NOefnUqjlUrx7uAgd6gX0ip23bBpTTJa5vvqNNiRtxkqc068yDjaIG1XqZODFlW7uucrfCHeNNxNQTj1hW1CJBVZL4tnxWPP8BQfzxfWQJFmroglvHpTJVXcpbjvrpPrRiypit2u2KWi8xR8dVR/Qf0kndEZHSwW7Ivd0VvgM7DHaxLPjUe0XId4VALIXQKPt6EF88wgc+3uSQOqyYvrpzw+g9QpvJLX/qB7Fwh+9D6tCdQlhIofKi9MeEXMycx9ElqjZ8Z67s+xWxXFlbiyPpjvW7YA0ag78NUMf2KnE8OuY33mO5XZBR9RIpKZ9MkPdZsEW4StqBl5+LbtwcCvSti0ZgZpndXTvaXgd0jvuRyQ2i9yvkYqReI7Ulf8t8TXXetfbckn0tPd7HKunspdtM7RvqiOlwfySGyIdWI7huAuXV60D0qRg3s8HJl7OuQHmkQnS+748= root@qeveria";

// --- FUNGSI PENGIRIM LOG TERPUSAT ---
// Kita akan gunakan 'logKey' untuk membedakan stream log
function sendLog(logKey, message, type = 'INFO') {
  sse.send({ logKey, type, data: message }, 'log-event');
}

// Fungsi untuk menjalankan perintah dan streaming outputnya
function executeAndStream(logKey, command, args, cwd) {
  return new Promise((resolve, reject) => {
    sendLog(logKey, `\n$ ${command} ${args.join(' ')}\n`, 'COMMAND');
    const child = spawn(command, args, { cwd });

    child.stdout.on('data', (data) => sendLog(logKey, data.toString(), 'STDOUT'));
    child.stderr.on('data', (data) => sendLog(logKey, data.toString(), 'STDERR'));

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorMsg = `Perintah "${command} ${args.join(' ')}" gagal dengan kode exit ${code}`;
        sendLog(logKey, errorMsg, 'ERROR');
        reject(new Error(errorMsg));
      }
    });
    child.on('error', (err) => {
      sendLog(logKey, err.message, 'ERROR');
      reject(err);
    });
  });
}

// =================================================================
// API Endpoints
// =================================================================

// Endpoint untuk streaming semua log
app.get('/api/logs', sse.init);

// Endpoint mendapatkan daftar instance
app.get('/api/instances', (req, res) => {
  exec('virsh list --all', (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ message: "Gagal menjalankan perintah virsh", error: stderr });
    }
    const lines = stdout.trim().split('\n').slice(2);
    const instances = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const [id, name, ...stateParts] = parts;
      if (!name) return null;
      return { id, name, state: stateParts.join(' ') };
    }).filter(Boolean);
    res.json(instances);
  });
});

// Endpoint membuat satu VM
app.post('/api/vms', (req, res) => {
  const { ip, hostname, os, cpu, memory, disk } = req.body;
  if (!ip || !hostname || !os || !cpu || !memory || !disk) {
    return res.status(400).json({ message: "Semua field harus diisi." });
  }

  const network = ip.split('.').slice(0, 3).join('.') + '.0';
  const fileContent = `
[LAB]
PUBKEY1: ${PUBKEY}

[VM1]
NAME: ${hostname}
OS: ${os}
NESTED: y
VCPUS: ${cpu}
MEMORY: ${memory}G
DISK1: ${disk}G
IFACE_NETWORK1: ${network}
IFACE_IP1: ${ip}
CONSOLE: vnc
  `.trim();
  
  const filePath = path.join(WORK_DIR, `${hostname}.txt`);
  fs.writeFile(filePath, fileContent, (err) => {
    if (err) {
      return res.status(500).json({ message: "Gagal menulis file konfigurasi." });
    }
    
    // Mulai proses di latar belakang
    runCreationCommands(hostname, hostname); // logKey sama dengan hostname

    res.status(202).json({ message: `File konfigurasi ${hostname}.txt berhasil dibuat. Memulai proses pembuatan VM...` });
  });
});

// Endpoint membuat cluster
app.post('/api/clusters', (req, res) => {
    const { clusterName, instances } = req.body;
    if (!clusterName || !instances || instances.length === 0) {
        return res.status(400).json({ message: "Nama cluster dan minimal satu instance dibutuhkan." });
    }

    let fileContent = `[LAB]\nPUBKEY1: ${PUBKEY}`;
    instances.forEach((vm, i) => {
        const network = vm.ip.split('.').slice(0, 3).join('.') + '.0';
        fileContent += `
\n[VM${i + 1}]
NAME: ${vm.hostname}
OS: ${vm.os}
NESTED: y
VCPUS: ${vm.cpu}
MEMORY: ${vm.memory}G
DISK1: ${vm.disk}G
IFACE_NETWORK1: ${network}
IFACE_IP1: ${vm.ip}
CONSOLE: vnc`;
    });

    const filePath = path.join(WORK_DIR, `${clusterName}.txt`);
    fs.writeFile(filePath, fileContent.trim(), (err) => {
        if (err) {
            return res.status(500).json({ message: "Gagal menulis file konfigurasi cluster." });
        }
        
        // Mulai proses di latar belakang
        runCreationCommands(clusterName, clusterName); // logKey sama dengan clusterName
        
        res.status(202).json({ message: `Proses pembuatan cluster ${clusterName} telah dimulai.` });
    });
});


// Fungsi untuk menjalankan proses pembuatan
async function runCreationCommands(logKey, configName) {
  const vmDir = path.join(WORK_DIR, configName);
  const commands = [
    { cmd: 'bash', args: [`${WORK_DIR}/not-tfgen.sh`, configName, `${configName}.txt`], cwd: WORK_DIR },
    { cmd: 'terraform', args: ['init'], cwd: vmDir },
    { cmd: 'terraform', args: ['apply', '-auto-approve'], cwd: vmDir },
  ];

  sendLog(logKey, `Memulai proses untuk ${configName}...`, 'START');
  try {
    for (const command of commands) {
      await executeAndStream(logKey, command.cmd, command.args, command.cwd);
    }
    sendLog(logKey, `Proses pembuatan untuk ${configName} SELESAI.`, 'END');
  } catch (error) {
    sendLog(logKey, `Proses pembuatan untuk ${configName} GAGAL.`, 'END');
  }
}

// Catch-all route untuk React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// Jalankan server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});