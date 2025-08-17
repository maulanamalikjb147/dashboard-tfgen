import React, { useState, useEffect } from 'react';
import './ClusterList.css';

// PENTING: Ganti IP ini dengan IP publik server Anda
const SERVER_IP = '170.39.194.242';
const API_BASE_URL = `http://${SERVER_IP}:5000`;

const ClusterList = () => {
  const [clusters, setClusters] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
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
    fetchClusters();
  }, []);

  if (isLoading) return <p>Memuat data cluster...</p>;

  return (
    <div>
      <div className="content-header"><h1>Cluster List</h1></div>
      <div className="cluster-grid">
        {clusters.length > 0 ? (
          clusters.map(cluster => (
            <div key={cluster.name} className="cluster-card">
              <h2 className="cluster-name">{cluster.name}</h2>
              <ul className="instance-list">
                {cluster.instances.map(instanceName => (
                  <li key={instanceName}>{instanceName}</li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p>Belum ada cluster yang dibuat.</p>
        )}
      </div>
    </div>
  );
};

export default ClusterList;
