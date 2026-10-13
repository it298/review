export function filterOccupancy(data,roomTypeId=''){
 if(!roomTypeId)return data;
 const roomTypes=(data?.roomTypes||[]).filter(r=>String(r.id)===String(roomTypeId));
 if(!roomTypes.length)return {summary:{occupied:null,blocked:null,total:null,empty:null,occupancyRate:null},roomTypes:[]};
 // Keep Bluejay's own rate for a room type (blocked rooms can affect its denominator).
 const room=roomTypes[0];return {...data,roomTypes,summary:{occupied:room.occupied,blocked:room.blocked,total:room.total,empty:room.empty,occupancyRate:room.occupancyRate}};
}
