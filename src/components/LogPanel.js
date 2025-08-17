import React, { useEffect, useRef } from 'react';
import './LogPanel.css'; // Kita akan buat file CSS ini

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
        return 'log-success';
      case 'INFO':
      default:
        return 'log-info';
    }
  };

  return (
    <div className="log-panel-container">
      {title && <h3 className="log-panel-title">{title}</h3>}
      <pre ref={logContainerRef} className="log-panel-output">
        {logs.map((log, index) => (
          <div key={index} className={`log-line ${getLogClass(log.type)}`}>
            {log.data}
          </div>
        ))}
      </pre>
    </div>
  );
};

export default LogPanel;
