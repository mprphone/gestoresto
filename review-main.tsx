import React from 'react';
import ReactDOM from 'react-dom/client';
import ReviewApp from './components/ReviewApp';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Não foi possível encontrar o elemento root');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ReviewApp />
  </React.StrictMode>
);
