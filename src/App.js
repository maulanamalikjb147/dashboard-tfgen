import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import InstanceList from './components/InstanceList';
import CreateVm from './components/CreateVm';
import CreateCluster from './components/CreateCluster';
import ClusterList from './components/ClusterList';
import ResizeQcow2 from './components/ResizeQcow2'; // Impor komponen baru
import { LuMenu } from 'react-icons/lu';

const SERVER_IP = '170.39.194.242'; // Pastikan IP ini benar
const API_BASE_URL = `http://${SERVER_IP}:5000`;

function App() {
  const [activeView, setActiveView] = useState('instanceList');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/instances`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setInstances(data);
    } catch (e) {
      setError(e.message);
      console.error("Gagal mengambil data instance:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  const handleCreationSuccess = () => {
    fetchInstances();
    setActiveView('instanceList');
  };

  const renderView = () => {
    const commonProps = {
      instances,
      loading,
      error,
    };

    switch (activeView) {
      case 'createVm':
        return <CreateVm onCreationSuccess={handleCreationSuccess} />;
      case 'createCluster':
        return <CreateCluster onCreationSuccess={handleCreationSuccess} />;
      case 'clusterList':
        return <ClusterList />;
      // --- TAMBAHKAN CASE BARU UNTUK RESIZE VM ---
      case 'resizeVm':
        return <ResizeQcow2 instances={instances} />;
      case 'instanceList':
      default:
        return <InstanceList {...commonProps} onRefresh={fetchInstances} />;
    }
  };

  return (
    <div className={`app-container ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        isSidebarOpen={isSidebarOpen}
      />
      <div className="content-wrapper">
        <header className="app-header">
          <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <LuMenu size={20} />
          </button>
        </header>
        <main className="main-content">
          {renderView()}
        </main>
      </div>
    </div>
  );
}

export default App;