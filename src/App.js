import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import InstanceList from './components/InstanceList';
import CreateVm from './components/CreateVm';
import CreateCluster from './components/CreateCluster';
// import IpManager from './components/IpManager'; // Dihapus
import ClusterList from './components/ClusterList';
import { LuMenu } from 'react-icons/lu';

function App() {
  const [activeView, setActiveView] = useState('instanceList');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // State untuk data instance tetap di sini untuk dibagikan ke komponen lain jika perlu
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fungsi untuk mengambil data, bisa dipanggil dari mana saja
  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Ganti URL ini dengan endpoint API Anda
      const response = await fetch('http://localhost:8080/api/instances');
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

  // Mengambil data saat komponen pertama kali dimuat
  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  // Fungsi ini dipanggil setelah VM/Cluster berhasil dibuat
  const handleCreationSuccess = () => {
    fetchInstances(); // Ambil data terbaru
    setActiveView('instanceList');
  };

  // Fungsi renderView sekarang tanpa IpManager
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
      // case 'ipManager' sudah dihapus
      case 'instanceList':
      default:
        // Oper fungsi fetchInstances agar tombol Refresh bisa berfungsi
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
