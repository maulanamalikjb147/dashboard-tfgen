// Import library yang dibutuhkan
const express = require('express');
const { exec, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const SSE = require('express-sse');

// Inisialisasi aplikasi Express
const app = express();
// Gunakan port dari environment variable untuk deployment, atau 5000 untuk lokal
const port = process.env.PORT || 5000; 

// Inisialisasi Server-Sent Events
const sse = new SSE();

// Middleware
app.use(express.json());

// =================================================================
// PENAMBAHAN PENTING: Sajikan Aplikasi React
// =================================================================
// Arahkan Express untuk menyajikan file statis (HTML, CSS, JS) dari folder 'build'
app.use(express.static(path.join(__dirname, 'build')));

// =================================================================
// API Endpoints (Sama seperti sebelumnya)
// =================================================================

// Endpoint 1: Mendapatkan Daftar Semua Instance VM
app.get('/api/instances', (req, res) => {
  exec('virsh list --all', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error executing virsh: ${error.message}`);
      return res.status(500).json({ message: "Gagal menjalankan perintah virsh", error: stderr });
    }
    const lines = stdout.trim().split('\n');
    const instances = lines
      .slice(2)
      .map(line => {
        const parts = line.trim().split(/\s+/);
        const id = parts[0];
        const name = parts[1];
        const state = parts.slice(2).join(' ');
        if (!name) return null;
        return { id, name, state };
      })
      .filter(Boolean);
    res.json(instances);
  });
});

// Endpoint 2: Membuat Virtual Machine Baru
app.post('/api/vms', (req, res) => {
  const { ip, hostname, os, cpu, memory, disk } = req.body;
  if (!ip || !hostname || !os || !cpu || !memory || !disk) {
    return res.status(400).json({ message: "Semua field harus diisi." });
  }
  const workDir = path.join(process.env.HOME, 'workdir', 'terraform-for-lab');
  const filePath = path.join(workDir, `${hostname}.txt`);
  const ipParts = ip.split('.');
  if (ipParts.length !== 4) {
    return res.status(400).json({ message: "Format IP tidak valid." });
  }
  ipParts[3] = '0';
  const network = ipParts.join('.');
  const fileContent = `
[LAB]
PUBKEY1: ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC+fpCtuUy4J+VQBYvUGDqusj0PGgIKtTmaVMmqHDYdp2spvxat7Rlh/NOefnUqjlUrx7uAgd6gX0ip23bBpTTJa5vvqNNiRtxkqc068yDjaIG1XqZODFlW7uucrfCHeNNxNQTj1hW1CJBVZL4tnxWPP8BQfzxfWQJFmroglvHpTJVXcpbjvrpPrRiypit2u2KWi8xR8dVR/Qf0kndEZHSwW7Ivd0VvgM7DHaxLPjUe0XId4VALIXQKPt6EF88wgc+3uSQOqyYvrpzw+g9QpvJLX/qB7Fwh+9D6tCdQlhIofKi9MeEXMycx9ElqjZ8Z67s+xWxXFlbiyPpjvW7YA0ag78NUMf2KnE8OuY33mO5XZBR9RIpKZ9MkPdZs1EW4StqBl5+LbtwcCvSti0ZgZpndXTvaXgd0jvuRyQ2i9yvkYqReI7Ulf8t8TXXetfbckn0tPd7HKunspdtM7RvqiOlwfySGyIdWI7huAuXV60D0qRg3s8HJl7OuQHmkQnS+748= root@qeveria

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

  fs.writeFile(filePath, fileContent, (err) => {
    if (err) {
      console.error(`Gagal menulis file: ${err.message}`);
      return res.status(500).json({ message: "Gagal menulis file konfigurasi." });
    }
    res.status(202).json({ message: `File konfigurasi ${hostname}.txt berhasil dibuat. Memulai proses pembuatan VM...` });
    runCreationCommands(hostname);
  });
});

// Endpoint 3: Streaming Log Pembuatan VM
app.get('/api/vms/logs', sse.init);

// ... (Fungsi sendLog, runCreationCommands, executeAndStream sama seperti sebelumnya) ...
function sendLog(hostname, message, type = 'INFO') {
  sse.send({ hostname, type, data: message }, 'creation-log');
}
async function runCreationCommands(hostname) {
  const workDir = path.join(process.env.HOME, 'workdir', 'terraform-for-lab');
  const vmDir = path.join(workDir, hostname);
  const commands = [
    { cmd: 'bash', args: [`${workDir}/not-tfgen.sh`, hostname, `${hostname}.txt`], cwd: workDir },
    { cmd: 'terraform', args: ['init'], cwd: vmDir },
    { cmd: 'terraform', args: ['apply', '-auto-approve'], cwd: vmDir },
  ];
  sendLog(hostname, `Memulai proses untuk ${hostname}...`, 'START');
  for (const command of commands) {
    try {
      await executeAndStream(hostname, command.cmd, command.args, command.cwd);
    } catch (error) {
      sendLog(hostname, `Error: ${error.message}`, 'ERROR');
      sendLog(hostname, `Proses pembuatan untuk ${hostname} GAGAL.`, 'END');
      return;
    }
  }
  sendLog(hostname, `Proses pembuatan untuk ${hostname} SELESAI.`, 'END');
}
function executeAndStream(hostname, command, args, cwd) {
  return new Promise((resolve, reject) => {
    sendLog(hostname, `\n$ ${command} ${args.join(' ')}\n`, 'COMMAND');
    const child = spawn(command, args, { cwd });
    child.stdout.on('data', (data) => sendLog(hostname, data.toString(), 'STDOUT'));
    child.stderr.on('data', (data) => sendLog(hostname, data.toString(), 'STDERR'));
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Perintah "${command} ${args.join(' ')}" gagal dengan kode exit ${code}`));
    });
    child.on('error', (err) => reject(err));
  });
}

// =================================================================
// CATCH-ALL ROUTE: Arahkan semua request lain ke aplikasi React
// =================================================================
// Ini penting agar routing di sisi klien (seperti React Router) berfungsi.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

// =================================================================
// Jalankan Server
// =================================================================
app.listen(port, () => {
  console.log(`Server monolith berjalan di http://localhost:${port}`);
});
