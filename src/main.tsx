import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './store/PoetContext';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('未找到 #root 挂载节点，请检查 index.html。');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>,
);
