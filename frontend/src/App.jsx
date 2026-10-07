import { useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Places from './pages/Places.jsx';

export default function App(){
  const [page,setPage]=useState('dashboard');
  return <div className="layout">
    <Sidebar page={page} setPage={setPage}/>
    {page==='dashboard'?<Dashboard/>:<Places/>}
  </div>;
}
