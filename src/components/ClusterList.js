import React, { useState, useEffect } from 'react';
import './ClusterList.css';
import ConfirmationModal from './ConfirmationModal';
import LogPanel from './LogPanel';
// --- ICON BARU DITAMBAHKAN ---
import { LuTrash2, LuRefreshCw } from 'react-icons/lu';

const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const ClusterList = () => {
  const [clusters, setClusters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [modalState, setModalState] = useState({ isOpen: false });
  const [isActionRunning, setIsActionRunning] = useState(false);
  const [actionLogs, setActionLogs] = useState([]);
  const [logTitle, setLogTitle] = useState('');
  const [activeLogKey, setActiveLogKey] = useState(null);

  const fetchClusters = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/clusters`);
      const data = await response.json();
      setClusters(data);
    } catch (err) {
      console.error("Error fetching clusters:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters();
  }, []);

  const confirmDestroy = (clusterName) => {
    setModalState({
      isOpen: true,
      title: `Konfirmasi Penghancuran`,
      message: `Anda yakin ingin menghancurkan cluster '${clusterName}'? Semua VM di dalamnya akan dihapus secara permanen.`,
      onConfirm: () => handleDestroy(clusterName)
    });
  };

  const handleDestroy = async (clusterName) => {
    setModalState({ isOpen: false });
    setIsActionRunning(true);
    setActionLogs([]);
    setLogTitle(`Menghancurkan cluster ${clusterName}...`);
    const logKey = `destroy-${clusterName}`;
    setActiveLogKey(logKey); 

    try {
      const response = await fetch(`${API_BASE_URL}/api/clusters/${clusterName}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error("Gagal memulai proses penghancuran cluster.");
      }
    } catch (error) {
      setActionLogs([{ type: 'ERROR', data: error.message }]);
      setIsActionRunning(false);
      setActiveLogKey(null);
    }
  };
  
  useEffect(() => {
    if (!isActionRunning || !activeLogKey) return;

    const eventSource = new EventSource(`${API_BASE_URL}/api/logs/${activeLogKey}`);
    
    eventSource.onmessage = (event) => {
      const logData = JSON.parse(event.data);
      setActionLogs(prev => [...prev, logData]);
      if (logData.type === 'END') {
        eventSource.close();
        setIsActionRunning(false);
        setActiveLogKey(null);
        fetchClusters();
      }
    };

    eventSource.onerror = () => {
      setActionLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi ke server log terputus.' }]);
      eventSource.close();
      setIsActionRunning(false);
      setActiveLogKey(null);
    };

    return () => eventSource.close();
  }, [isActionRunning, activeLogKey]);


  if (isLoading && clusters.length === 0) return <p>Memuat data cluster...</p>;

  return (
    <div>
      <ConfirmationModal 
        isOpen={modalState.isOpen} 
        onClose={() => setModalState({ isOpen: false })} 
        onConfirm={modalState.onConfirm} 
        title={modalState.title}>
          <p>{modalState.message}</p>
      </ConfirmationModal>
      
      {/* --- BAGIAN HEADER DIPERBARUI --- */}
      <div className="content-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
        <h1>Cluster List</h1>
        <button className="action-btn" onClick={fetchClusters} disabled={isLoading}>
            <LuRefreshCw className={isLoading ? 'spin' : ''} /> Refresh
        </button>
      </div>
      
      <div className="cluster-grid">
        {clusters.length > 0 ? (
          clusters.map(cluster => (
            <div key={cluster.name} className="cluster-card">
              <div className="cluster-card-header">
                <h2 className="cluster-name">{cluster.name}</h2>
                <button 
                  className="action-btn danger" 
                  onClick={() => confirmDestroy(cluster.name)}
                  disabled={isActionRunning}
                  title={`Destroy ${cluster.name} cluster`}
                >
                  <LuTrash2 size={16} />
                </button>
              </div>
              <ul className="instance-list">
                {cluster.instances.map(instanceName => (
                  <li key={instanceName}>{instanceName}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          !isLoading && <p>Belum ada cluster yang dibuat.</p>
        )}
      </div>

      { (isActionRunning || actionLogs.length > 0) && (
          <LogPanel logs={actionLogs} title={logTitle} />
      )}
    </div>
  );
};

export default ClusterList;