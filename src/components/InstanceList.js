import React, { useState, useEffect } from 'react';
import './InstanceList.css';
import ConfirmationModal from './ConfirmationModal';
import LogPanel from './LogPanel';
// ---> PERBAIKAN DI SINI <---
import { 
    LuServer, LuCpu, LuMemoryStick, LuHardDrive, LuNetwork, LuBoxes, 
    LuPlay, LuPower, LuRefreshCw, LuTrash2, LuChevronsRight, LuPencil, LuX 
} from 'react-icons/lu';

// const SERVER_IP = '170.39.194.242';
const API_BASE_URL = '';


const DetailItem = ({ label, value, onSave, icon, isEditing }) => {
    const [currentValue, setCurrentValue] = useState(value);
    const handleSave = () => { if (currentValue !== value) { onSave(currentValue); } };
    const canEdit = label !== 'Cluster Name';

    return (
        <div className="detail-item">
            <div className="detail-icon">{icon}</div>
            <div className="detail-content">
                <span className="detail-label">{label}</span>
                {isEditing && canEdit ? (
                    <input type="text" className="detail-input" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} onBlur={handleSave} onKeyDown={(e) => e.key === 'Enter' && handleSave()} autoFocus/>
                ) : (
                    <span className="detail-value">{value}</span>
                )}
            </div>
        </div>
    );
};

const InstanceList = () => {
    const [instances, setInstances] = useState([]);
    const [selectedInstance, setSelectedInstance] = useState(null);
    const [instanceDetails, setInstanceDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actionLogs, setActionLogs] = useState([]);
    const [isActionRunning, setIsActionRunning] = useState(false);
    const [logTitle, setLogTitle] = useState('');
    const [modalState, setModalState] = useState({ isOpen: false });
    const [isDetailPanelOpen, setIsDetailPanelOpen] = useState(false);
    const [isEditingDetails, setIsEditingDetails] = useState(false);

    const fetchInstances = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/instances`);
            const data = await response.json();
            setInstances(data);
        } catch (err) { console.error("Error fetching instances:", err); } 
        finally { setIsLoading(false); }
    };

    useEffect(() => { fetchInstances(); }, []);

    const handleSelectInstance = async (instance) => {
        if (selectedInstance?.name === instance.name && isDetailPanelOpen) {
            setIsDetailPanelOpen(false);
            return;
        }
        setSelectedInstance(instance);
        setInstanceDetails(null); 
        setActionLogs([]); 
        setIsActionRunning(false);
        setIsEditingDetails(false);
        setIsDetailPanelOpen(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/instances/${instance.name}`);
            const data = await response.json();
            setInstanceDetails(data);
        } catch (err) { console.error("Error fetching details:", err); }
    };
    
    const handleDetailSave = async (field, value) => {
        if (!selectedInstance) return;
        try {
            await fetch(`${API_BASE_URL}/api/instances/details`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostname: selectedInstance.name, details: { [field]: value } }), });
            setInstanceDetails(prev => ({ ...prev, [field]: value }));
            if (field === 'ip') { setInstances(prev => prev.map(inst => inst.name === selectedInstance.name ? { ...inst, ip: value } : inst)); }
        } catch (err) { console.error("Error saving detail:", err); }
    };

    const handleSimpleAction = async (hostname, action) => {
        setIsActionRunning(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/instances/${hostname}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
            if (!response.ok) throw new Error(`Gagal melakukan aksi '${action}'.`);
            await fetchInstances();
            if (selectedInstance && selectedInstance.name === hostname) {
                handleSelectInstance({ ...selectedInstance, state: action === 'start' ? 'running' : 'shut off' });
            }
        } catch (err) { alert(err.message); } 
        finally { setIsActionRunning(false); }
    };
    
    const confirmDestroy = (name, isCluster) => {
        setModalState({ isOpen: true, title: `Konfirmasi Penghancuran`, message: `Anda yakin ingin menghancurkan ${isCluster ? 'cluster' : 'instance'} '${name}'?`, onConfirm: () => handleDestroy(name, isCluster) });
    };

    const handleDestroy = async (name, isCluster) => {
        setModalState({ isOpen: false });
        setIsActionRunning(true);
        setActionLogs([]);
        setLogTitle(`Menghancurkan ${name}...`);
        const logKey = `destroy-${name}`;
        const endpoint = isCluster ? `${API_BASE_URL}/api/clusters/${name}` : `${API_BASE_URL}/api/instances/${name}`;
        try {
            const response = await fetch(endpoint, { method: 'DELETE' });
            if (!response.ok) throw new Error("Gagal memulai proses penghancuran.");
            const eventSource = new EventSource(`${API_BASE_URL}/api/logs/${logKey}`);
            eventSource.onmessage = (event) => {
                const logData = JSON.parse(event.data);
                setActionLogs(prev => [...prev, logData]);
                if (logData.type === 'END') {
                    eventSource.close();
                    setIsActionRunning(false);
                    setIsDetailPanelOpen(false);
                    fetchInstances();
                }
            };
            eventSource.onerror = () => {
                setActionLogs(prev => [...prev, { type: 'ERROR', data: 'Koneksi log terputus.' }]);
                eventSource.close();
                setIsActionRunning(false);
            };
        } catch (error) {
            setActionLogs([{ type: 'ERROR', data: error.message }]);
            setIsActionRunning(false);
        }
    };

    const isRunning = selectedInstance && selectedInstance.state.includes('running');
    const isClustered = instanceDetails && instanceDetails.clusterName !== '-';

    return (
        <>
            <ConfirmationModal isOpen={modalState.isOpen} onClose={() => setModalState({ isOpen: false })} onConfirm={modalState.onConfirm} title={modalState.title}><p>{modalState.message}</p></ConfirmationModal>
            
            <div className={`instance-page-layout ${isDetailPanelOpen ? 'detail-panel-open' : ''}`}>
                <div className="instance-list-panel">
                    <div className="content-header" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <h1>Instance List</h1>
                        <button className="action-btn" onClick={fetchInstances} disabled={isLoading}><LuRefreshCw className={isLoading ? 'spin' : ''} /> Refresh</button>
                    </div>
                    <table className="instance-table">
                        <thead><tr><th>Hostname</th><th>IP Address</th><th>Status</th></tr></thead>
                        <tbody>
                            {isLoading ? (<tr><td colSpan="3">Loading...</td></tr>) : (
                                instances.map(inst => (
                                    <tr key={inst.name} onClick={() => handleSelectInstance(inst)} className={selectedInstance?.name === inst.name ? 'selected' : ''}>
                                        <td>{inst.name}</td><td>{inst.ip}</td>
                                        <td><span className={`status-dot ${inst.state.includes('running') ? 'running' : 'stopped'}`}></span>{inst.state}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                <div className="instance-detail-panel">
                    {instanceDetails ? (
                        <>
                            <div className="detail-panel-header">
                                <h2 className="detail-header">{selectedInstance.name}</h2>
                                <div className="detail-header-actions">
                                    <button className="action-btn" onClick={() => setIsEditingDetails(!isEditingDetails)}>
                                        {/* ---> PERBAIKAN DI SINI <--- */}
                                        {isEditingDetails ? <LuX/> : <LuPencil/>} {isEditingDetails ? 'Done' : 'Edit'}
                                    </button>
                                    <button className="action-btn" onClick={() => setIsDetailPanelOpen(false)}>
                                        <LuChevronsRight/>
                                    </button>
                                </div>
                            </div>
                            
                            <div className="details-grid">
                                <DetailItem label="Cluster Name" value={instanceDetails.clusterName} icon={<LuBoxes />} isEditing={isEditingDetails} />
                                <DetailItem label="IP Address" value={instanceDetails.ip} icon={<LuNetwork />} isEditing={isEditingDetails} onSave={(val) => handleDetailSave('ip', val)} />
                                <DetailItem label="Operating System" value={instanceDetails.os} icon={<LuServer />} isEditing={isEditingDetails} onSave={(val) => handleDetailSave('os', val)} />
                                <DetailItem label="CPU" value={`${instanceDetails.cpu || '-'} Cores`} icon={<LuCpu />} isEditing={isEditingDetails} onSave={(val) => handleDetailSave('cpu', val.replace(' Cores', ''))} />
                                <DetailItem label="Memory" value={`${instanceDetails.memory || '-'} GB`} icon={<LuMemoryStick />} isEditing={isEditingDetails} onSave={(val) => handleDetailSave('memory', val.replace(' GB', ''))} />
                                <DetailItem label="Disk" value={`${instanceDetails.disk || '-'} GB`} icon={<LuHardDrive />} isEditing={isEditingDetails} onSave={(val) => handleDetailSave('disk', val.replace(' GB', ''))} />
                            </div>
                            
                            <div className="actions-panel">
                                <h3>Actions</h3>
                                <div className="action-buttons">
                                    <button className="action-btn" onClick={() => handleSimpleAction(selectedInstance.name, 'start')} disabled={isRunning || isActionRunning}><LuPlay/> Start</button>
                                    <button className="action-btn" onClick={() => handleSimpleAction(selectedInstance.name, 'shutdown')} disabled={!isRunning || isActionRunning}><LuPower/> Shutdown</button>
                                    <button className="action-btn" onClick={() => handleSimpleAction(selectedInstance.name, 'reboot')} disabled={!isRunning || isActionRunning}><LuRefreshCw/> Reboot</button>
                                </div>
                                <hr/>
                                <div className="action-buttons">
                                    <button className="action-btn danger" onClick={() => confirmDestroy(selectedInstance.name, false)} disabled={isActionRunning || isClustered}><LuTrash2/> Destroy VM</button>
                                    <button className="action-btn danger" onClick={() => confirmDestroy(instanceDetails.clusterName, true)} disabled={isActionRunning || !isClustered}><LuTrash2/> Destroy Cluster</button>
                                </div>
                            </div>
                            <LogPanel logs={actionLogs} title={logTitle} />
                        </>
                    ) : (
                        isDetailPanelOpen && <p>Loading details...</p>
                    )}
                </div>
            </div>
        </>
    );
};

export default InstanceList;
