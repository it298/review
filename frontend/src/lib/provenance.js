export const methodLabel=method=>({manual:'Nhập thủ công',extranet:'Đọc từ Extranet',browser:'Ghi nhận từ trình duyệt',ocr:'Tự động · đọc ảnh',dom:'Tự động · đọc trang',api:'Đọc từ API','google-api':'Đọc từ Google API'})[method]||'Đã ghi nhận';

export function readingMethods(reading){
 const fields=[
  [reading.rating!=null,'Điểm',reading.rating_method],
  [reading.review_count!=null||Boolean(reading.count_display),'Tổng đánh giá',reading.count_method],
  [reading.rank_position!=null,'Thứ hạng',reading.rank_method]
 ];
 const groups=new Map();
 for(const [present,label,fieldMethod] of fields){
  if(!present)continue;
  const method=fieldMethod||reading.collection_method;
  if(!method)continue;
  groups.set(method,[...(groups.get(method)||[]),label]);
 }
 return [...groups].map(([method,fields])=>({method,label:methodLabel(method),fields:fields.join(', ')}));
}

export function observationAge(value,now=Date.now()){
 const stamp=Date.parse(value);
 if(!Number.isFinite(stamp)||stamp>now)return '';
 const minutes=Math.floor((now-stamp)/60000);
 if(minutes<1)return 'Vừa ghi nhận';
 if(minutes<60)return minutes+' phút trước';
 if(minutes<1440)return Math.floor(minutes/60)+' giờ trước';
 return Math.floor(minutes/1440)+' ngày trước';
}
