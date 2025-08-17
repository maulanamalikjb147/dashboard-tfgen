import React, { useEffect, useRef } from 'react';
import './LogPanel.css'; // Pastikan CSS ini ada

const LogPanel = ({ logs, title }) => {
  const logContainerRef = useRef(null);

  // Efek untuk auto-scroll ke log terbaru
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Fungsi untuk menentukan class CSS berdasarkan tipe log
  const getLogClass = (logType) => {
    switch (logType) {
      case 'ERROR':
      case 'STDERR':
        return 'log-error';
      case 'SUCCESS':
      case 'END': // Memberi warna hijau saat selesai
        return 'log-success';
      case 'COMMAND':
        return 'log-command'; // Menambahkan style untuk command
      case 'INFO':
      default:
        return 'log-info';
    }
  };

  const renderLogLine = (log, index) => {
    // Menghindari rendering objek kosong atau data yang tidak valid
    if (!log || typeof log.data !== 'string') {
      return null;
    }
    return (
      <div key={index} className={`log-line ${getLogClass(log.type)}`}>
        {log.data}
      </div>
    );
  };

  return (
    <div className="log-panel-container">
      {title && <h3 className="log-panel-title">{title}</h3>}
      <pre ref={logContainerRef} className="log-panel-output">
        {logs.map(renderLogLine)}
      </pre>
    </div>
  );
};

export default LogPanel;