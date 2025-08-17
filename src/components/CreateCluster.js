import React, { useState, useEffect, useRef } from 'react';
import { LuPlus, LuTrash2 } from 'react-icons/lu';

// PENTING: Ganti IP ini dengan IP publik server Anda
const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const CreateCluster = ({ onCreationSuccess }) => {
  const [osImages, setOsImages] = useState([]);
  const [clusterName, setClusterName] = useState('');
  const [instances, setInstances] = useState([
    { hostname: '', ip: '', os: '', cpu: '2', disk: '50', memory: '4' }
  ]);
  const [isCreating, setIsCreating] = useState(false);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  useEffect(() => {
    const fetchOsImages = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/os-images`);
        const data = await response.json();
        if (data && data.length > 0) {
          setOsImages(data);
          setInstances(prev => {
            const newInstances = [...prev];
            if (newInstances.length > 0) {
              newInstances[0].os = data[0];
            }
            return newInstances;
          });
        }
      } catch (error) {
        console.error("Gagal mengambil daftar OS:", error);
      }
    };
    fetchOsImages();
  }, []);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [logs]);

  useEffect(() => {
    if (!isCreating || !clusterName) return;
    const eventSource = new EventSource(`${API_BASE_URL}/api/vms/logs/${clusterName}`);
    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      setLogs(prevLogs => [...prevLogs, logData]);
      if (logData.type === 'END') {
        setIsCreating(false);
        eventSource.close();
        if (onCreationSuccess && !logs.some(l => l.type === 'ERROR')) {
          onCreationSuccess();
        }
      }
    };
    eventSource.onerror = () => {
      setLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi ke server log terputus.' }]);
      setIsCreating(false);
      eventSource.close();
    };
    return () => eventSource.close();
  }, [isCreating, clusterName, onCreationSuccess, logs]);

  const handleInstanceChange = (index, e) => {
    const { name, value } = e.target;
    const newInstances = [...instances];
    newInstances[index][name] = value;
    setInstances(newInstances);
  };

  const addInstance = () => {
    setInstances([...instances, { hostname: '', ip: '', os: osImages[0] || '', cpu: '2', disk: '50', memory: '4' }]);
  };

  const removeInstance = (index) => {
    const newInstances = instances.filter((_, i) => i !== index);
    setInstances(newInstances);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLogs([]);
    setIsCreating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterName, instances }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setLogs([{ type: 'INFO', data: result.message }]);
    } catch (error) {
      setLogs([{ type: 'ERROR', data: error.message }]);
      setIsCreating(false);
    }
  };
  
  const renderLogLine = (log, index) => {
    let color = '#d1d5db';
    if (log.type === 'STDERR' || log.type === 'ERROR') color = '#ef4444';
    if (log.type === 'COMMAND') color = '#eab308';
    if (log.type === 'END' || log.type === 'START') color = '#22c55e';
    return <p key={index} style={{ color, margin: 0, whiteSpace: 'pre-wrap' }}>{log.data}</p>;
  };

  return (
    <div>
      <div className="content-header"><h1>Create VM Cluster</h1></div>
      <form onSubmit={handleSubmit} className="form-container">
        <div className="form-group">
          <label htmlFor="clusterName">Cluster Name</label>
          <input type="text" id="clusterName" value={clusterName} onChange={(e) => setClusterName(e.target.value)} required disabled={isCreating} />
        </div>

        {instances.map((instance, index) => (
          <div key={index} className="cluster-instance-form" style={{border: '1px solid #ddd', padding: '1.5rem', marginBottom: '1.5rem', borderRadius: '8px', backgroundColor: '#fdfdfd'}}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3>Instance #{index + 1}</h3>
              {instances.length > 1 && (
                <button type="button" className="btn-icon" onClick={() => removeInstance(index)} disabled={isCreating} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#dc3545'}}>
                  <LuTrash2 size={20} />
                </button>
              )}
            </div>
            
            {/* ---> FORM LENGKAP DI SINI <--- */}
            <div className="form-group">
              <label>Hostname</label>
              <input type="text" name="hostname" value={instance.hostname} onChange={(e) => handleInstanceChange(index, e)} required disabled={isCreating} />
            </div>
            <div className="form-group">
              <label>IP Address</label>
              <input type="text" name="ip" value={instance.ip} onChange={(e) => handleInstanceChange(index, e)} required disabled={isCreating} />
            </div>
            <div className="form-group">
              <label>Operating System</label>
              <select name="os" value={instance.os} onChange={(e) => handleInstanceChange(index, e)} required disabled={isCreating || osImages.length === 0}>
                {osImages.map(image => <option key={image} value={image}>{image}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>CPU</label>
              <div className="input-wrapper">
                <input type="number" name="cpu" value={instance.cpu} onChange={(e) => handleInstanceChange(index, e)} min="1" required disabled={isCreating} />
                <span className="input-unit">Cores</span>
              </div>
            </div>
            <div className="form-group">
              <label>Disk</label>
              <div className="input-wrapper">
                <input type="number" name="disk" value={instance.disk} onChange={(e) => handleInstanceChange(index, e)} min="10" required disabled={isCreating} />
                <span className="input-unit">GB</span>
              </div>
            </div>
            <div className="form-group">
              <label>Memory</label>
              <div className="input-wrapper">
                <input type="number" name="memory" value={instance.memory} onChange={(e) => handleInstanceChange(index, e)} min="1" required disabled={isCreating} />
                <span className="input-unit">GB</span>
              </div>
            </div>
          </div>
        ))}
        
        <div style={{display: 'flex', gap: '1rem'}}>
          <button type="button" className="btn btn-secondary" onClick={addInstance} disabled={isCreating} style={{display: 'flex', alignItems: 'center'}}>
            <LuPlus style={{ marginRight: '8px' }} /> Add More Instance
          </button>
          <button type="submit" className="btn btn-primary" disabled={isCreating}>
            {isCreating ? 'Creating Cluster...' : 'Create Cluster'}
          </button>
        </div>
      </form>

      {logs.length > 0 && (
        <div className="logs-container" style={{ backgroundColor: '#1f2937', color: '#f9fafb', padding: '1rem', marginTop: '2rem', borderRadius: '8px', fontFamily: 'monospace', maxHeight: '400px', overflowY: 'auto' }}>
          <h3>Creation Logs for {clusterName}</h3>
          <div>
            {logs.map(renderLogLine)}
            <div ref={logsEndRef} />
          </div>
        </div>
      )}
    </div>
  );
};

export default CreateCluster;
