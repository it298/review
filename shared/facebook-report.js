// Source-period reports complement daily API facts, never overwrite them.
export const FACEBOOK_REPORT_FIELDS=[
 ['media_views','Lượt xem','lượt'],['period_unique_viewers','Người xem duy nhất trong kỳ','người'],
 ['post_engagements','Lượt tương tác','lượt'],['link_clicks','Click liên kết trong kỳ','lượt'],
 ['page_visits','Lượt truy cập Page','lượt'],['new_follows','Lượt theo dõi mới','lượt'],
 ['message_contacts','Liên hệ Messenger theo báo cáo','liên hệ'],['response_rate','Tỷ lệ phản hồi','%'],
 ['published_posts','Số bài đã đăng','bài']
];
export function validateFacebookReport(input){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(!input||typeof input!=='object'||!input.values||typeof input.values!=='object'||Array.isArray(input.values))fail('Nhập số liệu báo cáo hợp lệ.');
 if(typeof input.source_note!=='string'||!input.source_note.trim()||input.source_note.length>500)fail('Ghi nguồn số liệu từ 1 đến 500 ký tự.');
 const keys=new Set(FACEBOOK_REPORT_FIELDS.map(([key])=>key));
 if(Object.keys(input.values).some(key=>!keys.has(key)))fail('Báo cáo có chỉ số chưa được hỗ trợ.');
 const values={};for(const [key]of FACEBOOK_REPORT_FIELDS){const v=input.values[key];if(v==null||v==='')continue;if(typeof v!=='number'||!Number.isFinite(v)||v<0||(key==='response_rate'?v>100:!Number.isSafeInteger(v)))fail('Số liệu phải không âm; tỷ lệ từ 0 đến 100%, các chỉ số đếm phải là số nguyên.');values[key]=v;}
 if(!Object.keys(values).length)fail('Cần ít nhất một chỉ số có giá trị.');
 return {values,source_note:input.source_note.trim()};
}
