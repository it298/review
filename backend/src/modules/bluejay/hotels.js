export const HOTELS = [
  { id: 5381, entityKey:'sontra-sea-hotel',name: "Sontra Sea Hotel", shortName: "Sontra Sea" },
  { id: 6836, entityKey:'vistara-gia-lai-sea-hotel',name: "Vistara Gia Lai", shortName: "Vistara Gia Lai" },
  { id: 6495, entityKey:'quy-nhon-sea-hotel',name: "Vistara Quy Nhon", shortName: "Vistara Quy Nhon" },
  { id: 6209, entityKey:'yzistel-hoi-an-39-le-quy-don',name: "Yzistel Hoi An", shortName: "Yzistel Hoi An" },
];

export function findHotel(id) {
  return HOTELS.find((hotel) => String(hotel.id) === String(id));
}
