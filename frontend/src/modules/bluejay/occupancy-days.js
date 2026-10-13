export function occupancyDays(roomTypes){
  const days=new Map();
  for(const room of roomTypes){
    for(const source of room.daily||[]){
      if(!source.date)continue;
      const date=String(source.date).slice(0,10);
      const day=days.get(date)||{date,occupied:0,empty:0,blocked:0,total:0};
      for(const field of ['occupied','empty','blocked','total'])day[field]+=Number(source[field])||0;
      days.set(date,day);
    }
  }
  return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>({...day,occupancyRate:day.total>day.blocked?Number((day.occupied/(day.total-day.blocked)*100).toFixed(2)):null}));
}
