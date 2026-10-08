begin;
update public.review_tracker_directory_sources set source_url='https://www.tripadvisor.com.vn/Hotel_Review-g25289644-d33037118-Reviews-Yzistel_Hoi_An-Cam_Pho_Hoi_An_Quang_Nam_Province.html' where entity_key='yzistel-hoi-an-39-le-quy-don' and source='tripadvisor' and source_url='https://www.tripadvisor.com.vn/Hotel_Review-g298082-d33035770-Reviews-Yzistel_Hoi_An-Hoi_An_Quang_Nam_Province.html';
update public.review_tracker_directory_sources set source_url='https://food.grab.com/vn/en/restaurant/vintage-taste-deli-cafe-hoi-an-delivery/5-C7A1JXMWFGADDE' where entity_key='vintage-taste-deli-cafe-hoi-an' and source='grab' and source_url='https://r.grab.com/g/6-20260221_175024_2b63e26fb9ef4feba8fc4f214f17751b_MEXMPS-5-C7A1JXMWFGADDE';
update public.review_tracker_directory_sources set source_url='https://shopeefood.vn/now-food/shop/1306443' where entity_key='trandoc-mini-mart-24h' and source='shopee' and source_url='https://shopeefood.vn/u/9Jw7H9S';
commit;
