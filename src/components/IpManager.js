import React, { useState, useEffect } from 'react';
import './IpManager.css'; // Buat file CSS baru jika belum ada

const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const IpManager = () => {
  const [ipList, setIpList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchIpList = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/ip-list`);
        const data = await response.json();
        setIpList(data);
      } catch (err) {
        console.error("Gagal mengambil daftar IP:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchIpList();
  }, []);

  return (
    <div>
      <div className="content-header">
        <h1>IP Manager</h1>
      </div>
      <p>Daftar ini menampilkan semua IP dan hostname yang dikelola oleh dashboard. Data diperbarui secara otomatis saat Anda membuat atau mengedit instance.</p>
      
      <div className="ip-list-container">
        <table className="ip-table">
          <thead>
            <tr>
              <th>IP Address</th>
              <th>Hostname</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="2">Memuat data...</td></tr>
            ) : (
              ipList.map(({ ip, hostname }) => (
                <tr key={hostname}>
                  <td>{ip}</td>
                  <td>{hostname}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IpManager;
