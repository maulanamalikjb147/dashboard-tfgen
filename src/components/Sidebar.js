import React from 'react';
import './Sidebar.css';
import { LuLayoutList, LuSquarePlus, LuServerCog, LuBoxes } from 'react-icons/lu';

const Sidebar = ({ activeView, setActiveView, isSidebarOpen }) => {
  const menuItems = [
    { id: 'instanceList', label: 'List Instance', icon: <LuLayoutList size={22} /> },
    { id: 'clusterList', label: 'Cluster List', icon: <LuBoxes size={22} /> },
    { id: 'createVm', label: 'Create VM', icon: <LuSquarePlus size={22} /> },
    { id: 'createCluster', label: 'Create Cluster', icon: <LuServerCog size={22} /> },
    // Baris berikut ini sudah dihapus:
    // { id: 'ipManager', label: 'IP Manager', icon: <LuNetwork size={22} /> }, 
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="logo-icon">🚀</span>
        <h2 className="logo-text">VM Dashboard</h2>
      </div>
      <nav className="sidebar-nav">
        <ul>
          {menuItems.map(item => (
            <li
              key={item.id}
              className={activeView === item.id ? 'active' : ''}
              onClick={() => setActiveView(item.id)}
              title={!isSidebarOpen ? item.label : ''}
            >
              <div className="menu-icon">{item.icon}</div>
              <span className="menu-label">{item.label}</span>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
