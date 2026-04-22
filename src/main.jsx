import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// We removed the CSS import for now to prevent 404 errors
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)