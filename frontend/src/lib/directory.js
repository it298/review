export const categories={hotel:'Khách sạn',cafe:'Café',store:'Cửa hàng',activity:'Hoạt động / địa điểm'};
export const platforms={google:{name:'Google Maps',scale:5},tripadvisor:{name:'TripAdvisor',scale:5},agoda:{name:'Agoda',scale:10},booking:{name:'Booking.com',scale:10},expedia:{name:'Expedia',scale:10},trip:{name:'Trip.com',scale:10},traveloka:{name:'Traveloka',scale:10},grab:{name:'GrabFood / GrabMart',scale:5},shopee:{name:'ShopeeFood',scale:5}};
export function directoryRows(directory,data,summaries,targets){
 const rows=directory.map(e=>({...e,key:e.entity_key,sources:[...(e.sources||[])],readings:{}}));
 for(const p of data.places){
  let row=rows.find(e=>e.google_place_id===p.id);
  if(!row){row={key:'google:'+p.id,name:p.name,category:'hotel',relationship:'managed',google_place_id:p.id,sources:[],readings:{}};rows.push(row);}
  const g=[...data.rows].reverse().find(r=>r.values[p.id])?.values[p.id];
  if(g)row.readings.google={rating:g.rating,rating_max:5,review_count:g.reviews,captured_at:g.capturedAt};
 }
 const all=[...summaries,...targets.filter(t=>!summaries.some(s=>s.source===t.source&&s.property_id===t.property_id))];
 for(const source of all){
  const s={...source,...targets.find(t=>t.source===source.source&&t.property_id===source.property_id)};
  let row=rows.find(e=>e.key===s.hotel_key)||(s.google_place_id?rows.find(e=>e.google_place_id===s.google_place_id):undefined);
  if(!row){row={key:s.hotel_key||s.source+':'+s.property_id,name:s.property_name,category:'hotel',relationship:'managed',sources:[],readings:{}};rows.push(row);}
  row.readings[s.source]=s;
  if(!row.sources.some(v=>v.source===s.source))row.sources.push({source:s.source,source_url:s.source_url});
 }
 return rows;
}
export function safeSourceUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
