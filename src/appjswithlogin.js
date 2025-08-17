import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import InstanceList from './components/InstanceList';
import CreateVm from './components/CreateVm';
import CreateCluster from './components/CreateCluster';
import ClusterList from './components/ClusterList';
import ResizeQcow2 from './components/ResizeQcow2';
import LoginPage from './LoginPage'; // Import komponen login
import { LuMenu } from 'react-icons/lu';

// --- KONSTANTA ASLI ANDA, TIDAK DIUBAH ---
const SERVER_IP = '170.39.194.242'; // Pastikan IP ini benar
const API_BASE_URL = `http://${SERVER_IP}:5000`;
// -----------------------------------------

function App() {
  // State untuk mengelola status login
  const [authStatus, setAuthStatus] = useState('checking'); // 'checking', 'authenticated', 'unauthenticated'
  
  // State asli Anda
  const [activeView, setActiveView] = useState('instanceList');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fungsi untuk memeriksa sesi ke backend
  const checkAuthentication = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/check_auth`, { credentials: 'include' });
      if (response.ok) {
        setAuthStatus('authenticated');
      } else {
        setAuthStatus('unauthenticated');
      }
    } catch (error) {
      setAuthStatus('unauthenticated');
    }
  }, []);

  // Jalankan pemeriksaan saat komponen pertama kali dimuat
  useEffect(() => {
    checkAuthentication();
  }, [checkAuthentication]);

  const fetchInstances = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/instances`, { credentials: 'include' });
      if (!response.ok) {
        if (response.status === 401) {
          setAuthStatus('unauthenticated');
        }
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
    // Hanya ambil data jika sudah terotentikasi
    if (authStatus === 'authenticated') {
      fetchInstances();
    }
  }, [authStatus, fetchInstances]);

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
      case 'resizeVm':
        return <ResizeQcow2 instances={instances} />;
      case 'instanceList':
      default:
        return <InstanceList {...commonProps} onRefresh={fetchInstances} />;
    }
  };

  // 1. Tampilkan loading saat memeriksa sesi
  if (authStatus === 'checking') {
    return <div style={{textAlign: 'center', paddingTop: '50px'}}>Memeriksa sesi...</div>;
  }

  // 2. Jika belum login, tampilkan halaman login
  if (authStatus === 'unauthenticated') {
    // onLoginSuccess akan memanggil checkAuthentication untuk mengubah status
    return <LoginPage onLoginSuccess={checkAuthentication} />;
  }
  
  // 3. Jika sudah login, tampilkan dashboard
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