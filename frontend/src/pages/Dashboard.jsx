import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function formatDate(value) {
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function formatNumber(value) {
  if (value == null || value === '') return '';
  return new Intl.NumberFormat('vi-VN').format(value);
}

export default function Dashboard() {
  const [data, setData] = useState({ places: [], dates: [], rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSync, setLastSync] = useState(null);

  async function load() {
    try {
      setError('');
      setData(await api('/api/places/dashboard-matrix'));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  function exportCsv() {
    const quote = value => '"' + String(value ?? '').replace(/"/g, '""') + '"';
    const safeName = value => /^[=+@-]/.test(value) ? "'" + value : value;
    const lines = [ ['Ngày', ...data.places.flatMap(p=>[safeName(p.name)+' - Review', safeName(p.name)+' - Điểm sao'])],
      ...data.rows.map(row=>[row.date,...data.places.flatMap(p=>[row.values[p.id]?.reviews ?? '',row.values[p.id]?.rating ?? ''])]) ];
    const blob = new Blob(['\uFEFF'+lines.map(row=>row.map(quote).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url;a.download='lich-su-review.csv';a.click();URL.revokeObjectURL(url);
  }
  async function sync() {
    setLoading(true);
    setError('');
    try {
      const summary = await api('/api/places/sync', { method: 'POST' });
      setLastSync(summary);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="content dashboard-page">
      <header className="dashboard-toolbar">
        <div>
          <h1>THEO DÕI REVIEW KHÁCH SẠN</h1>
          <p>Google Maps · Mỗi dòng là một ngày ghi nhận · Mỗi khách sạn gồm Số Review và Điểm Sao</p>
        </div>
        <button className="primary" onClick={sync} disabled={loading}>
          {loading ? 'Đang cập nhật...' : 'Cập nhật Google Maps'}
        </button>
      </header>

      <button className="export-button" disabled={!data.rows.length} onClick={exportCsv}>Xuất CSV</button>
      {lastSync?.skipped && <div className="notice">Đang có phiên đồng bộ chạy. Vui lòng tải lại sau.</div>}
      {lastSync?.results?.filter(x=>!x.ok).map(x=><div className="notice error" key={x.placeId}>{x.name}: {x.error}</div>)}
      {error && <div className="notice error">{error}</div>}
      {lastSync && !lastSync.skipped && (
        <div className="notice sync-summary">
          Đã cập nhật {lastSync.results.filter(x => x.ok).length}/{lastSync.total} địa điểm
          {lastSync.workers ? ` · ${lastSync.workers} worker` : ''}.
          {lastSync.results.some(x => !x.ok) ? ' Một số địa điểm lỗi, xem lại URL hoặc thử lại.' : ''}
        </div>
      )}

      {data.places.length === 0 ? (
        <section className="card empty">Chưa có địa điểm. Sang mục “Địa điểm” để thêm khách sạn từ URL Google Maps.</section>
      ) : (
        <section className="dashboard-table-wrap">
          <table className="review-matrix">
            <thead>
              <tr className="matrix-title-row">
                <th rowSpan="3" className="date-head">Date</th>
                <th colSpan={data.places.length * 2} className="google-head">Google Maps</th>
              </tr>
              <tr className="place-head-row">
                {data.places.map(place => (
                  <th key={place.id} colSpan="2" className="place-group" title={place.googleMapsUri || ''}>
                    <div><a href={place.googleMapsUri} target="_blank" rel="noreferrer">{place.name}</a></div>
                  </th>
                ))}
              </tr>
              <tr className="subhead-row">
                {data.places.flatMap(place => [
                  <th key={`${place.id}-reviews`}>Số<br />Review</th>,
                  <th key={`${place.id}-rating`}>Điểm Sao</th>
                ])}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(row => (
                <tr key={row.date}>
                  <td className="date-cell">{formatDate(row.date)}</td>
                  {data.places.flatMap(place => {
                    const value = row.values[place.id];
                    return [
                      <td key={`${place.id}-${row.date}-reviews`} className="review-cell">
                        {value ? formatNumber(value.reviews) : ''}
                      </td>,
                      <td key={`${place.id}-${row.date}-rating`} className="rating-cell">
                        {value?.rating ?? ''}
                      </td>
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="matrix-note">
        Mỗi khách sạn có tối đa 1 snapshot/ngày. Chạy cập nhật nhiều lần trong ngày sẽ ghi đè snapshot của ngày đó, tránh dữ liệu trùng.
      </div>
    </main>
  );
}
