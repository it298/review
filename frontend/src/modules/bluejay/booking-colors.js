const palette=['#80609d','#c4a365','#478c88','#b66675','#6284b0','#9b886e','#b38ab5','#6e9870'];
const statusColors={'Đã hủy':'#b66675','Không đến':'#c17d45','Đã nhận phòng':'#478c88','Đã trả phòng':'#6284b0','Đã xác nhận':'#80609d','Đang giữ phòng':'#c4a365'};
const sourceColors={'Agoda':'#80609d','Booking.com':'#6284b0','Ctrip':'#c4a365','Traveloka.com':'#478c88','Expedia':'#b66675','Khách lẻ':'#6e9870','Zalo':'#b38ab5'};
export function bookingColor(label){return statusColors[label]||sourceColors[label]||palette[Array.from(label).reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%palette.length];}
