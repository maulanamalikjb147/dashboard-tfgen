import React, { useState, useEffect } from 'react';
import LogPanel from './LogPanel';
import { LuLoaderCircle } from 'react-icons/lu';

// const SERVER_IP = '170.39.194.242';
const API_BASE_URL = '';


const ResizeQcow2 = ({ instances }) => {
  const [selectedVm, setSelectedVm] = useState('');
  const [isResizing, setIsResizing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [activeLogKey, setActiveLogKey] = useState(null);

  useEffect(() => {
    if (instances && instances.length > 0 && !selectedVm) {
      setSelectedVm(instances[0].name);
    }
  }, [instances, selectedVm]);

  useEffect(() => {
    if (!activeLogKey) return;

    // --- PERBAIKAN LOGIKA LOG ---
    // Penanda untuk memastikan log hanya di-reset pada pesan pertama
    let isFirstMessage = true;
    const eventSource = new EventSource(`${API_BASE_URL}/api/logs/${activeLogKey}`);

    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      
      if (isFirstMessage) {
        // Ganti log lama dengan log pertama yang baru
        setLogs([logData]);
        isFirstMessage = false;
      } else {
        // Tambahkan log berikutnya
        setLogs(prev => [...prev, logData]);
      }

      if (logData.type === 'END') {
        setIsResizing(false);
        setActiveLogKey(null);
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi ke server log terputus.' }]);
      setIsResizing(false);
      setActiveLogKey(null);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [activeLogKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVm) {
      alert('Please select a VM.');
      return;
    }

    const selectedInstance = instances.find(inst => inst.name === selectedVm);
    if (!selectedInstance || selectedInstance.ip === '-') {
        alert('Could not find IP for the selected VM. Please ensure it has been assigned one.');
        return;
    }

    // --- PERBAIKAN LOGIKA LOG ---
    // Hapus baris setLogs([]) dari sini
    setIsResizing(true);
    const logKey = `resize-${selectedVm}`;
    setActiveLogKey(logKey);

    try {
      const response = await fetch(`${API_BASE_URL}/api/tools/resize-vm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: selectedVm, ip: selectedInstance.ip }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      // Biarkan log pertama ditangani oleh EventSource
    } catch (error) {
      setLogs([{ type: 'ERROR', data: error.message }]);
      setIsResizing(false);
      setActiveLogKey(null);
    }
  };

  return (
    <div>
      <div className="content-header">
        <h1>Resize qcow2 Image</h1>
      </div>
      <form onSubmit={handleSubmit} className="form-container">
        <p>
          This tool will compact the qcow2 disk image for a selected virtual machine.
          It performs a `qemu-img convert` which can help reduce the physical file size
          of a sparsely populated virtual disk. The VM will be shut down during this process.
        </p>
        <div className="form-group">
          <label htmlFor="vm-select">Select a VM</label>
          <select 
            id="vm-select" 
            value={selectedVm} 
            onChange={(e) => setSelectedVm(e.target.value)}
            disabled={isResizing || !instances || instances.length === 0}
          >
            {instances && instances.length > 0 ? (
              instances.map(inst => (
                <option key={inst.name} value={inst.name}>
                  {inst.name} ({inst.ip})
                </option>
              ))
            ) : (
              <option>Loading VMs...</option>
            )}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={isResizing || !selectedVm}>
          {isResizing ? (
            <>
              <LuLoaderCircle className="spin" style={{ marginRight: '8px' }} />
              Processing...
            </>
          ) : (
            'Start Resize Process'
          )}
        </button>
      </form>

      {logs.length > 0 && (
        <LogPanel logs={logs} title={`Resize Logs for ${selectedVm}`} />
      )}
    </div>
  );
};

export default ResizeQcow2;