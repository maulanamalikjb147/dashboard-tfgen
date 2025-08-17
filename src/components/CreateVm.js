import React, { useState, useEffect } from 'react';
import LogPanel from './LogPanel'; // Impor komponen baru

const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const CreateVm = ({ onCreationSuccess }) => { 
  const [osImages, setOsImages] = useState([]);
  const [formData, setFormData] = useState({ ip: '', hostname: '', os: '', cpu: '', disk: '', memory: '' });
  const [isCreating, setIsCreating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [lastHostname, setLastHostname] = useState('');

  useEffect(() => {
    const fetchOsImages = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/os-images`);
        const data = await response.json();
        if (data && data.length > 0) {
          setOsImages(data);
          setFormData(prev => ({ ...prev, os: data[0] }));
        }
      } catch (error) { console.error("Gagal mengambil daftar OS:", error); }
    };
    fetchOsImages();
  }, []);

  useEffect(() => {
    if (!isCreating || !lastHostname) return;
    const eventSource = new EventSource(`${API_BASE_URL}/api/logs/${lastHostname}`);
    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      setLogs(prevLogs => [...prevLogs, logData]);
      if (logData.type === 'END') {
        setIsCreating(false);
        eventSource.close();
        setTimeout(() => {
            setLogs(currentLogs => {
                const hasError = currentLogs.some(l => l.type === 'ERROR' || l.type === 'STDERR');
                if (onCreationSuccess && !hasError) onCreationSuccess();
                return currentLogs;
            });
        }, 100);
      }
    };
    eventSource.onerror = () => {
      setLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi ke server log terputus.' }]);
      setIsCreating(false);
      eventSource.close();
    };
    return () => eventSource.close();
  }, [isCreating, lastHostname, onCreationSuccess]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLogs([]);
    setIsCreating(true);
    setLastHostname(formData.hostname);
    try {
      const response = await fetch(`${API_BASE_URL}/api/vms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setLogs([{ type: 'INFO', data: result.message }]);
    } catch (error) {
      setLogs([{ type: 'ERROR', data: error.message }]);
      setIsCreating(false);
    }
  };

  return (
    // Menggunakan class dari file CSS sebelumnya agar konsisten
    <div className="create-vm-container"> 
      <div className="content-header"><h1>Create Virtual Machine</h1></div>
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group"><label htmlFor="ip">IP Address</label><input type="text" id="ip" name="ip" value={formData.ip} onChange={handleChange} required disabled={isCreating} /></div>
        <div className="form-group"><label htmlFor="hostname">Hostname</label><input type="text" id="hostname" name="hostname" value={formData.hostname} onChange={handleChange} required disabled={isCreating} /></div>
        <div className="form-group"><label htmlFor="os">Operating System</label><select id="os" name="os" value={formData.os} onChange={handleChange} required disabled={isCreating || osImages.length === 0}>{osImages.length > 0 ? (osImages.map(image => <option key={image} value={image}>{image}</option>)) : (<option>Memuat OS...</option>)}</select></div>
        <div className="form-group"><label htmlFor="cpu">CPU</label><div className="input-wrapper"><input type="number" id="cpu" name="cpu" value={formData.cpu} onChange={handleChange} min="1" required disabled={isCreating} /><span className="input-unit">Cores</span></div></div>
        <div className="form-group"><label htmlFor="disk">Disk</label><div className="input-wrapper"><input type="number" id="disk" name="disk" value={formData.disk} onChange={handleChange} min="10" required disabled={isCreating} /><span className="input-unit">GB</span></div></div>
        <div className="form-group"><label htmlFor="memory">Memory</label><div className="input-wrapper"><input type="number" id="memory" name="memory" value={formData.memory} onChange={handleChange} min="1" required disabled={isCreating} /><span className="input-unit">GB</span></div></div>
        <button type="submit" className="btn btn-primary" disabled={isCreating}>{isCreating ? 'Creating VM...' : 'Create VM'}</button>
      </form>
      
      {/* Panel Log hanya akan dirender jika proses pembuatan berjalan atau ada log */}
      {(isCreating || logs.length > 0) && (
        <LogPanel logs={logs} title={`Creation Logs for ${lastHostname}`} />
      )}
    </div>
  );
};

export default CreateVm;
