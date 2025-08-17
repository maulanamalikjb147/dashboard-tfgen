import React, { useState, useEffect } from 'react';
import LogPanel from './LogPanel';
import { LuLoaderCircle } from 'react-icons/lu';


const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const CreateVm = ({ onCreationSuccess }) => {
  const [osImages, setOsImages] = useState([]);
  const [formData, setFormData] = useState({ ip: '', hostname: '', os: '', cpu: '2', disk: '50', memory: '4' });
  const [isCreating, setIsCreating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeLogKey, setActiveLogKey] = useState(null);

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
    if (!activeLogKey) return;
    
    let isFirstMessage = true;
    const eventSource = new EventSource(`${API_BASE_URL}/api/logs/${activeLogKey}`);
    
    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      
      if (isFirstMessage) {
        setLogs([logData]);
        isFirstMessage = false;
      } else {
        setLogs(prevLogs => [...prevLogs, logData]);
      }

      if (logData.type === 'END') {
        setIsCreating(false);
        setActiveLogKey(null);
        eventSource.close();
        setTimeout(() => {
            setLogs(currentLogs => {
                const hasError = currentLogs.some(l => l.type === 'ERROR' || l.type === 'STDERR');
                if (onCreationSuccess && !hasError) {
                  onCreationSuccess();
                }
                return currentLogs;
            });
        }, 200);
      }
    };

    eventSource.onerror = () => {
      setLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi ke server log terputus.' }]);
      setIsCreating(false);
      setActiveLogKey(null);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeLogKey, onCreationSuccess]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsCreating(true);
    setActiveLogKey(formData.hostname);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/vms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      // Log pertama akan ditangani oleh EventSource
    } catch (error) {
      setLogs([{ type: 'ERROR', data: error.message }]);
      setIsCreating(false);
      setActiveLogKey(null);
    }
  };

  return (
    <div> 
      <div className="content-header"><h1>Create Virtual Machine</h1></div>
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group"><label htmlFor="ip">IP Address</label><input type="text" id="ip" name="ip" value={formData.ip} onChange={handleChange} required disabled={isCreating} /></div>
        <div className="form-group"><label htmlFor="hostname">Hostname</label><input type="text" id="hostname" name="hostname" value={formData.hostname} onChange={handleChange} required disabled={isCreating} /></div>
        <div className="form-group"><label htmlFor="os">Operating System</label><select id="os" name="os" value={formData.os} onChange={handleChange} required disabled={isCreating || osImages.length === 0}>{osImages.length > 0 ? (osImages.map(image => <option key={image} value={image}>{image}</option>)) : (<option>Memuat OS...</option>)}</select></div>
        <div className="form-group"><label htmlFor="cpu">CPU</label><div className="input-wrapper"><input type="number" id="cpu" name="cpu" value={formData.cpu} onChange={handleChange} min="1" required disabled={isCreating} /><span className="input-unit">Cores</span></div></div>
        <div className="form-group"><label htmlFor="disk">Disk</label><div className="input-wrapper"><input type="number" id="disk" name="disk" value={formData.disk} onChange={handleChange} min="10" required disabled={isCreating} /><span className="input-unit">GB</span></div></div>
        <div className="form-group"><label htmlFor="memory">Memory</label><div className="input-wrapper"><input type="number" id="memory" name="memory" value={formData.memory} onChange={handleChange} min="1" required disabled={isCreating} /><span className="input-unit">GB</span></div></div>
        <button type="submit" className="btn btn-primary" disabled={isCreating}>
          {isCreating ? (
            <>
              <LuLoaderCircle className="spin" style={{ marginRight: '8px' }} />
              Creating VM...
            </>
          ) : (
            'Create VM'
          )}
        </button>
      </form>
      
      {logs.length > 0 && (
        <LogPanel logs={logs} title={`Creation Logs for ${activeLogKey}`} />
      )}
    </div>
  );
};

export default CreateVm;