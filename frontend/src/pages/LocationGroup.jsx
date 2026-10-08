import {useEffect,useState} from 'react';
import {api} from '../lib/api.js';
import SourceOverview from '../components/SourceOverview.jsx';
export const locationPages={
 hotels:{title:'Khách sạn',category:'hotel',description:'Điểm và tổng đánh giá của các khách sạn công ty quản lý.'},
 cafes:{title:'Café',category:'cafe',description:'Theo dõi các café trên Google Maps, TripAdvisor, GrabFood và ShopeeFood.'},
 stores:{title:'Cửa hàng',category:'store',description:'Theo dõi các cửa hàng trên Google Maps, TripAdvisor, GrabMart và ShopeeFood.'},
 activities:{title:'Hoạt động / địa điểm',category:'activity',description:'Theo dõi điểm và đánh giá của các địa điểm hoạt động.'},
 comparison:{title:'Đối thủ / so sánh',category:'all',description:'Bảng riêng cho các địa điểm đối thủ và các mục so sánh.'}
};
export default function LocationGroup({page}){
 const [data,setData]=useState({places:[],rows:[],dates:[]}),[error,setError]=useState('');
 const group=locationPages[page];
 useEffect(()=>{let active=true;api('/api/places/dashboard-matrix').then(value=>{if(active)setData(value);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 return <main className="content"><header className="page-header"><div><span className="eyebrow">THEO DÕI REVIEW</span><h1>{group.title}<span className="heading-dot">.</span></h1><p>{group.description}</p></div></header>{error&&<p className="notice error" role="alert">Không tải được dữ liệu Google: {error}</p>}<SourceOverview data={data} fixedCategory={group.category==='all'?undefined:group.category} fixedRelationship={page==='comparison'?'comparison':'managed'} showMetrics={false}/></main>;
}
