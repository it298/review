// Bound ZIP expansion before the workbook parser inflates XLSX XML.
export function checkExcelArchive(bytes){
 const fail=()=>{throw Object.assign(new Error('File Excel không hợp lệ hoặc giải nén vượt 100 MB. Chia nhỏ file trước khi tải.'),{status:400});};
 if(!Buffer.isBuffer(bytes)||bytes.length<8)return fail();
 if(bytes.subarray(0,8).equals(Buffer.from([208,207,17,224,161,177,26,225])))return; // bounded 10 MB legacy XLS input
 if(bytes.readUInt32LE(0)!==0x04034b50)return fail();
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)return fail();const count=bytes.readUInt16LE(end+10);let pos=bytes.readUInt32LE(end+16),total=0;
 if(count===65535||pos===0xffffffff||count>2000)return fail();
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)return fail();
  const size=bytes.readUInt32LE(pos+24),flags=bytes.readUInt16LE(pos+8);if(size===0xffffffff||flags&1)return fail();
  total+=size;if(total>100*1024*1024)return fail();
  pos+=46+bytes.readUInt16LE(pos+28)+bytes.readUInt16LE(pos+30)+bytes.readUInt16LE(pos+32);
 }
 if(pos>end)return fail();
}
