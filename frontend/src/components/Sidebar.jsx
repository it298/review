export default function Sidebar({ page, setPage }) {
  return <aside className="sidebar">
    <div className="brand">Places<span>Tracker</span></div>
    <nav>
      <button className={page==='dashboard'?'active':''} onClick={()=>setPage('dashboard')}>Dashboard</button>
      <button className={page==='places'?'active':''} onClick={()=>setPage('places')}>Địa điểm</button>
    </nav>
  </aside>;
}
