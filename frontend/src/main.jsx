import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Privacy from './pages/Privacy.jsx';
import './styles.css';
import './modules/design-system.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{/^\/privacy\/?$/.test(window.location.pathname)?<Privacy/>:<App/>}</React.StrictMode>
);
