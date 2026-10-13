import React, { useEffect, useMemo, useState } from "react";
import {api} from "../../lib/api.js";
import "./bluejay.css";

const API = new URL("/api/bluejay",window.location.origin).href;

const HOTEL_COLORS = ["#2563eb", "#7c3aed", "#0891b2", "#ea580c"];

function today() {
  return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
}

function currentMonth() {
  return today().slice(0, 7);
}

function number(value) {
  if(value===null||value===undefined)return '—';
  return Number(value || 0).toLocaleString("vi-VN");
}

function money(value) {
  if(value===null||value===undefined)return '—';
  return `${Number(value || 0).toLocaleString("vi-VN")} ₫`;
}

function pct(value) {
  if(value===null||value===undefined)return '—';
  const n = Number(value || 0);
  return `${Number.isInteger(n) ? n : n.toFixed(2)}%`;
}

function formatDateTime(value) {
  if (!value) return "Chưa có";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("vi-VN",{timeZone:'Asia/Ho_Chi_Minh'});
}

async function getJson(url,options){const parsed=new URL(url);return api(parsed.pathname+parsed.search,options);}

function downloadCsv(filename, headers, rows) {
  const escape = (v) => {const text=String(v??'');const safe=typeof v==='string'&&/^\s*[=+@-]/.test(text)?"'"+text:text;return `"${safe.replaceAll('"','""')}"`;};
  const csv = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\r\n");

  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, helper }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {helper && <small>{helper}</small>}
    </article>
  );
}

function SourceBadge({ source, savedAt }) {
  if (!source) return null;
  return (
    <span className={`sourceBadge ${source}`}>
      {source === "live" ? "LIVE" : "ĐÃ LƯU"}
      {savedAt ? ` · ${new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit",timeZone:'Asia/Ho_Chi_Minh' })}` : ""}
    </span>
  );
}

function OccupancyBar({ value, color = "#2563eb" }) {
  const width = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="barTrack">
      <div className="barFill" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

export default function BluejayModule({tab="dashboard",onTabChange}) {
  const setTab = onTabChange;
  const [hotels, setHotels] = useState([]);
  const [hotelId, setHotelId] = useState("5381");
  const [dateType, setDateType] = useState("1");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [reservationDateType, setReservationDateType] = useState("3");
  const [serviceType, setServiceType] = useState("0");
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [reservationStatus, setReservationStatus] = useState("");

  useEffect(() => {
    Promise.all([
      getJson(`${API}/hotels`),
      getJson(`${API}/status`),
    ])
      .then(([hotelRows, apiStatus]) => {
        setHotels(hotelRows);
        setStatus(apiStatus);
      })
      .catch(() => setError("Backend chưa chạy hoặc chưa kết nối được."));
  }, []);

  useEffect(() => {
    setPayload(null);
    setError("");
    setNotice("");
    if (tab === "sync") {
      refreshStatus();
    }
  }, [tab]);

  useEffect(() => {
    if (dateType === "2") {
      setFrom(currentMonth());
      setTo(currentMonth());
    } else {
      setFrom(today());
      setTo(today());
    }
  }, [dateType]);
  useEffect(()=>{
    if(dateType!=='2'||tab==='sync')return;
    if(tab==='dashboard'||tab==='occupancy'){if(from.length===10)setFrom(from.slice(0,7));if(to.length===10)setTo(to.slice(0,7));}
    else {if(from.length===7)setFrom(from+'-01');if(to.length===7){const last=new Date(to+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);setTo(last.toISOString().slice(0,10));}}
  },[tab]);

  async function refreshStatus() {
    try {
      setStatus(await getJson(`${API}/status`));
    } catch {}
  }

  function dateQuery(url) {
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    return url;
  }

  async function load(refresh = false) {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      let url;

      if (tab === "dashboard") {
        url = dateQuery(new URL(`${API}/dashboard`));
        url.searchParams.set("dateType", dateType);
        if (refresh) url.searchParams.set("refresh", "1");
      } else if (tab === "occupancy") {
        url = dateQuery(new URL(`${API}/hotels/${hotelId}/occupancy`));
        url.searchParams.set("dateType", dateType);
        if (refresh) url.searchParams.set("refresh", "1");
      } else if (tab === "reservations") {
        url = dateQuery(new URL(`${API}/hotels/${hotelId}/reservations`));
        url.searchParams.set("dateType", reservationDateType);
        if (refresh) url.searchParams.set("refresh", "1");
      } else if (tab === "services") {
        url = dateQuery(new URL(`${API}/hotels/${hotelId}/services`));
        url.searchParams.set("serviceType", serviceType);
        if (refresh) url.searchParams.set("refresh", "1");
      } else {
        return;
      }

      const result = await getJson(url);
      setPayload(result);

      if (refresh) {
        setNotice("Đã yêu cầu dữ liệu trực tiếp từ Blue Jay và lưu trong hệ thống.");
      }
      await refreshStatus();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function syncAll() {
    setSyncing(true);
    setError("");
    setNotice("");

    try {
      const result = await getJson(`${API}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hotelIds: hotels.map((h) => h.id),
          datasets: ["occupancy", "reservations", "services"],
          from,
          to,
          dateType:from.length===7?'2':'1',
          reservationDateType,
          serviceType,
        }),
      });

      const ok = result.results.filter((r) => r.ok).length;
      setNotice(`Đồng bộ xong ${ok}/${result.results.length} tác vụ.`);
      await refreshStatus();
      if (tab !== "sync") await load(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  const reservationRows = payload?.data?.rows || [];
  const filteredReservations = useMemo(() => {
    return reservationRows.filter((r) => {
      const hay = [
        r.bookingCode,
        r.guestName,
        r.roomType,
        r.roomName,
        r.source,
        r.status,
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !search || hay.includes(search.toLowerCase());
      const statusOk = !reservationStatus || r.status === reservationStatus;
      return searchOk && statusOk;
    });
  }, [reservationRows, search, reservationStatus]);

  const statuses = useMemo(
    () => [...new Set(reservationRows.map((r) => r.status).filter(Boolean))].sort(),
    [reservationRows]
  );

  const windowAllowed = status?.apiWindow?.allowed;

  const nav = [
    ["dashboard", "Tổng quan"],
    ["occupancy", "Công suất"],
    ["reservations", "Đặt phòng"],
    ["services", "Dịch vụ"],
    ["sync", "Đồng bộ"],
  ];

  return (
    <div className="bluejay-module app">
      <header className="topbar">
        <div>
          <div className="eyebrow">BLUE JAY PMS · 4 PROPERTIES</div>
          <h1>Hotel Analytics</h1>
          <p>Tổng hợp công suất, đặt phòng và dịch vụ</p>
        </div>
        <div className={`windowStatus ${windowAllowed ? "open" : "closed"}`}>
          <b>{windowAllowed ? "API đang trong khung gọi" : "API ngoài khung gọi"}</b>
          <span>
            {status?.apiWindow?.localTime || "--:--"} ·{" "}
            {status?.apiWindow?.timezone || "Asia/Ho_Chi_Minh"}
          </span>
        </div>
      </header>

      {tab !== "sync" && (
        <section className="filters">
          {tab !== "dashboard" && (
            <label className="wide">
              Khách sạn
              <select value={hotelId} onChange={(e) => setHotelId(e.target.value)}>
                {hotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} ({h.id})
                  </option>
                ))}
              </select>
            </label>
          )}

          {(tab === "dashboard" || tab === "occupancy") && (
            <label>
              Kiểu báo cáo
              <select value={dateType} onChange={(e) => setDateType(e.target.value)}>
                <option value="1">Theo ngày</option>
                <option value="2">Theo tháng</option>
              </select>
            </label>
          )}

          {tab === "reservations" && (
            <label>
              Loại ngày
              <select
                value={reservationDateType}
                onChange={(e) => setReservationDateType(e.target.value)}
              >
                <option value="0">Ngày nhận</option>
                <option value="1">Ngày trả</option>
                <option value="2">Ngày đặt</option>
                <option value="3">Đêm ở</option>
              </select>
            </label>
          )}

          {tab === "services" && (
            <label>
              Loại dịch vụ
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                <option value="0">Tất cả</option>
                <option value="5">Dịch vụ thuộc phòng</option>
                <option value="6">Dịch vụ ngoài phòng</option>
              </select>
            </label>
          )}

          <label>
            Từ
            <input
              type={dateType === "2" && (tab === "dashboard" || tab === "occupancy") ? "month" : "date"}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>

          <label>
            Đến
            <input
              type={dateType === "2" && (tab === "dashboard" || tab === "occupancy") ? "month" : "date"}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>

          <button className="secondary" onClick={() => load(false)} disabled={loading}>
            {loading ? "Đang tải..." : "Xem dữ liệu"}
          </button>
          <button className="primary" onClick={() => load(true)} disabled={loading}>
            Đồng bộ Blue Jay
          </button>
        </section>
      )}

      {!windowAllowed && tab !== "sync" && (
        <div className="hint">
          Ngoài khung giờ API, nút <b>Xem dữ liệu</b> vẫn dùng dữ liệu đã lưu. Nút{" "}
          <b>Đồng bộ Blue Jay</b> có thể bị Blue Jay từ chối.
        </div>
      )}

      {notice && <div className="notice">{notice}</div>}
      {error && <div className="error">{error}</div>}
      {!payload&&tab!=='sync'&&<section className="module-empty"><h2>{status?.configured===false?'Chưa kết nối Blue Jay':'Chọn khoảng ngày để xem báo cáo'}</h2><p>{status?.configured===false?'Module đã sẵn sàng. Kết nối tài khoản Blue Jay để đọc dữ liệu kinh doanh của 4 khách sạn.':'Nhấn Xem dữ liệu để mở dữ liệu đã lưu hoặc Đồng bộ Blue Jay để lấy bản cập nhật.'}</p></section>}

      {tab==='dashboard'&&payload&&payload.aggregate?.complete===false&&<div className="hint">Có dữ liệu {payload.aggregate.availableHotels}/{payload.hotels?.length||4} khách sạn. Tổng chỉ tính các khách sạn đã đọc được.</div>}
      {tab === "dashboard" && payload && (
        <Dashboard payload={payload} />
      )}

      {tab === "occupancy" && payload && (
        <Occupancy payload={payload} />
      )}

      {tab === "reservations" && payload && (
        <Reservations
          payload={payload}
          rows={filteredReservations}
          search={search}
          setSearch={setSearch}
          reservationStatus={reservationStatus}
          setReservationStatus={setReservationStatus}
          statuses={statuses}
        />
      )}

      {tab === "services" && payload && (
        <Services payload={payload} />
      )}

      {tab === "sync" && (
        <SyncCenter
          status={status}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
          syncing={syncing}
          syncAll={syncAll}
          refreshStatus={refreshStatus}
        />
      )}
    </div>
  );
}

function Dashboard({ payload }) {
  const aggregate = payload.aggregate || {};
  const hotelRows = payload.hotels || [];

  return (
    <>
      <section className="metrics five">
        <Metric label="Công suất toàn hệ thống" value={pct(aggregate.occupancyRate)} />
        <Metric label="Phòng đã sử dụng" value={number(aggregate.occupied)} />
        <Metric label="Phòng trống" value={number(aggregate.empty)} />
        <Metric label="Phòng block" value={number(aggregate.blocked)} />
        <Metric label="Tổng room-night" value={number(aggregate.total)} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>So sánh công suất</h2>
            <p>Công suất theo từng property trong khoảng đã chọn</p>
          </div>
        </div>

        <div className="compareList">
          {hotelRows.map((row, index) => {
            const s = row.data?.summary;
            return (
              <div className="compareRow" key={row.hotel.id}>
                <div className="compareName">
                  <b>{row.hotel.name}</b>
                  <small>HotelId {row.hotel.id}</small>
                </div>

                {row.ok && s ? (
                  <>
                    <div className="compareBar">
                      <OccupancyBar
                        value={s.occupancyRate}
                        color={HOTEL_COLORS[index % HOTEL_COLORS.length]}
                      />
                    </div>
                    <strong>{pct(s.occupancyRate)}</strong>
                    <span className="compareRooms">
                      {number(s.occupied)} / {number(s.total)}
                    </span>
                    <SourceBadge source={row.source} savedAt={row.savedAt} />
                  </>
                ) : (
                  <div className="rowError">Chưa có dữ liệu</div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="hotelGrid">
        {hotelRows.map((row, index) => {
          const s = row.data?.summary;
          return (
            <article className="hotelCard" key={row.hotel.id}>
              <div className="hotelCardTop">
                <div>
                  <small>HOTEL {row.hotel.id}</small>
                  <h3>{row.hotel.name}</h3>
                </div>
                <div
                  className="dot"
                  style={{ background: HOTEL_COLORS[index % HOTEL_COLORS.length] }}
                />
              </div>

              {row.ok && s ? (
                <>
                  <div className="hotelRate">{pct(s.occupancyRate)}</div>
                  <OccupancyBar
                    value={s.occupancyRate}
                    color={HOTEL_COLORS[index % HOTEL_COLORS.length]}
                  />
                  <div className="hotelStats">
                    <span>
                      Đã dùng <b>{number(s.occupied)}</b>
                    </span>
                    <span>
                      Trống <b>{number(s.empty)}</b>
                    </span>
                    <span>
                      Block <b>{number(s.blocked)}</b>
                    </span>
                  </div>
                  <div className="hotelFooter">
                    <SourceBadge source={row.source} savedAt={row.savedAt} />
                  </div>
                </>
              ) : (
                <p className="muted">Chưa có dữ liệu cho bộ lọc này.</p>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}

function Occupancy({ payload }) {
  const summary = payload.data?.summary || {};
  const roomTypes = payload.data?.roomTypes || [];
  const dailyRows = roomTypes.flatMap((room) =>
    (room.daily || []).map((day) => ({
      ...day,
      roomType: room.name,
      roomTypeId: room.id,
    }))
  );

  function exportRoomTypes() {
    downloadCsv(
      `occupancy-roomtypes-${payload.hotel?.id || "hotel"}.csv`,
      ["Hạng phòng", "Đã dùng", "Đã đặt", "Trống", "Block", "Tổng", "Công suất %"],
      roomTypes.map((r) => [
        r.name,
        r.occupied,
        r.booked,
        r.empty,
        r.blocked,
        r.total,
        r.occupancyRate,
      ])
    );
  }

  return (
    <>
      <div className="sectionTitle">
        <div>
          <h2>{payload.hotel?.name}</h2>
          <p>Báo cáo công suất phòng</p>
        </div>
        <SourceBadge source={payload.source} savedAt={payload.savedAt} />
      </div>

      <section className="metrics five">
        <Metric label="Công suất" value={pct(summary.occupancyRate)} />
        <Metric label="Đã sử dụng" value={number(summary.occupied)} />
        <Metric label="Phòng trống" value={number(summary.empty)} />
        <Metric label="Block" value={number(summary.blocked)} />
        <Metric label="Tổng room-night" value={number(summary.total)} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Theo hạng phòng</h2>
            <p>{roomTypes.length} hạng phòng</p>
          </div>
          <button className="ghost" onClick={exportRoomTypes}>
            Xuất CSV
          </button>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Hạng phòng</th>
                <th>Đã dùng</th>
                <th>Đã đặt</th>
                <th>Trống</th>
                <th>Block</th>
                <th>Tổng</th>
                <th>Công suất</th>
              </tr>
            </thead>
            <tbody>
              {roomTypes.map((r) => (
                <tr key={r.id}>
                  <td><b>{r.name}</b></td>
                  <td>{number(r.occupied)}</td>
                  <td>{number(r.booked)}</td>
                  <td>{number(r.empty)}</td>
                  <td>{number(r.blocked)}</td>
                  <td>{number(r.total)}</td>
                  <td className="rateCell">
                    <span>{pct(r.occupancyRate)}</span>
                    <OccupancyBar value={r.occupancyRate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Chi tiết theo ngày</h2>
            <p>{dailyRows.length} dòng dữ liệu</p>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Hạng phòng</th>
                <th>Đã dùng</th>
                <th>Trống</th>
                <th>Block</th>
                <th>Tổng</th>
                <th>Công suất</th>
              </tr>
            </thead>
            <tbody>
              {dailyRows.map((r, index) => (
                <tr key={`${r.roomTypeId}-${r.date}-${index}`}>
                  <td>{r.date}</td>
                  <td>{r.roomType}</td>
                  <td>{number(r.occupied)}</td>
                  <td>{number(r.empty)}</td>
                  <td>{number(r.blocked)}</td>
                  <td>{number(r.total)}</td>
                  <td>{pct(r.occupancyRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Reservations({
  payload,
  rows,
  search,
  setSearch,
  reservationStatus,
  setReservationStatus,
  statuses,
}) {
  const totals = payload.data?.totals || {};

  function exportRows() {
    downloadCsv(
      `reservations-${payload.hotel?.id || "hotel"}.csv`,
      [
        "Booking Code",
        "Khách",
        "Hạng phòng",
        "Phòng",
        "Nguồn",
        "Trạng thái",
        "Check-in",
        "Check-out",
        "Số đêm",
        "Tiền phòng",
        "Dịch vụ",
        "Tổng tiền",
        "Đã thanh toán",
        "Còn lại",
      ],
      rows.map((r) => [
        r.bookingCode,
        r.guestName,
        r.roomType,
        r.roomName,
        r.source,
        r.status,
        r.checkInTime,
        r.checkOutTime,
        r.night,
        r.roomPrice,
        r.servicePrice,
        r.totalPrice,
        r.payment,
        r.balance,
      ])
    );
  }

  return (
    <>
      <div className="sectionTitle">
        <div>
          <h2>{payload.hotel?.name}</h2>
          <p>Reservation</p>
        </div>
        <SourceBadge source={payload.source} savedAt={payload.savedAt} />
      </div>

      <section className="metrics five">
        <Metric label="Số booking" value={number(totals.count)} />
        <Metric label="Tiền phòng" value={money(totals.roomPrice)} />
        <Metric label="Tiền dịch vụ" value={money(totals.servicePrice)} />
        <Metric label="Tổng booking" value={money(totals.totalPrice)} />
        <Metric label="Còn lại" value={money(totals.balance)} />
      </section>

      <section className="panel">
        <div className="panelHeader reservationTools">
          <div>
            <h2>Danh sách đặt phòng</h2>
            <p>Hiển thị {rows.length} booking sau lọc</p>
          </div>
          <div className="inlineTools">
            <input
              placeholder="Tìm khách, mã booking, phòng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              value={reservationStatus}
              onChange={(e) => setReservationStatus(e.target.value)}
            >
              <option value="">Tất cả trạng thái</option>
              {statuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button className="ghost" onClick={exportRows}>Xuất CSV</button>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Mã</th>
                <th>Khách</th>
                <th>Hạng phòng</th>
                <th>Phòng</th>
                <th>Nguồn</th>
                <th>Trạng thái</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Đêm</th>
                <th>Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, index) => (
                <tr key={`${r.bookingCode}-${index}`}>
                  <td><b>{r.bookingCode}</b></td>
                  <td>{r.guestName}</td>
                  <td>{r.roomType}</td>
                  <td>{r.roomName}</td>
                  <td>{r.source}</td>
                  <td><span className="statusPill">{r.status}</span></td>
                  <td>{r.checkInTime}</td>
                  <td>{r.checkOutTime}</td>
                  <td>{number(r.night)}</td>
                  <td>{money(r.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Services({ payload }) {
  const groups = payload.data?.groups || [];
  const totals = payload.data?.totals || {};

  function exportGroups() {
    downloadCsv(
      `services-${payload.hotel?.id || "hotel"}.csv`,
      ["Nhóm dịch vụ", "Số lượng", "Doanh thu"],
      groups.map((g) => [g.group, g.quantity, g.totalPrice])
    );
  }

  return (
    <>
      <div className="sectionTitle">
        <div>
          <h2>{payload.hotel?.name}</h2>
          <p>Service Summary</p>
        </div>
        <SourceBadge source={payload.source} savedAt={payload.savedAt} />
      </div>

      <section className="metrics three">
        <Metric label="Nhóm dịch vụ" value={number(groups.length)} />
        <Metric label="Tổng số lượng" value={number(totals.quantity)} />
        <Metric label="Tổng doanh thu dịch vụ" value={money(totals.totalPrice)} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Tổng hợp theo nhóm</h2>
            <p>Dữ liệu từ Blue Jay Service Summary</p>
          </div>
          <button className="ghost" onClick={exportGroups}>Xuất CSV</button>
        </div>

        <div className="serviceGrid">
          {groups.map((g, index) => (
            <article className="serviceCard" key={`${g.group}-${index}`}>
              <span>{g.group || `Nhóm ${index + 1}`}</span>
              <strong>{money(g.totalPrice)}</strong>
              <small>{number(g.quantity)} lượt</small>
              {g.services?.length > 0 && (
                <div className="serviceItems">
                  {g.services.slice(0, 5).map((s) => (
                    <div key={s.id || s.name}>
                      <span>{s.name}</span>
                      <b>{number(s.quantity)}</b>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>

        {groups.length === 0 && (
          <p className="muted">Không có dữ liệu dịch vụ trong khoảng đã chọn.</p>
        )}
      </section>
    </>
  );
}

function SyncCenter({
  status,
  from,
  to,
  setFrom,
  setTo,
  syncing,
  syncAll,
  refreshStatus,
}) {
  const logs = status?.syncLog || [];

  return (
    <>
      <section className="syncHero">
        <div>
          <div className="eyebrow">DATA SYNC CENTER</div>
          <h2>Đồng bộ dữ liệu Blue Jay</h2>
          <p>
            Dữ liệu đã đồng bộ được lưu trong hệ thống để tiếp tục xem ngoài khung giờ API.
          </p>
        </div>
        <div className={`windowStatus ${status?.apiWindow?.allowed ? "open" : "closed"}`}>
          <b>{status?.apiWindow?.allowed ? "Có thể gọi API" : "Ngoài khung API"}</b>
          <span>{status?.apiWindow?.label}</span>
        </div>
      </section>

      <section className="metrics three">
        <Metric label="Bản ghi đã lưu" value={number(status?.store?.records)} />
        <Metric
          label="Lần lưu gần nhất"
          value={formatDateTime(status?.store?.latestSavedAt)}
        />
        <Metric label="Tự động đồng bộ" value={status?.autoSync ? "Đang bật" : "Đang tắt"} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Đồng bộ thủ công tất cả khách sạn</h2>
            <p>Công suất + Reservation + Service Summary</p>
          </div>
        </div>

        <div className="syncControls">
          <label>
            Từ ngày
            <input type={from.length===7?'month':'date'} value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>
            Đến ngày
            <input type={to.length===7?'month':'date'} value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <button className="primary" onClick={syncAll} disabled={syncing}>
            {syncing ? "Đang đồng bộ..." : "Đồng bộ tất cả"}
          </button>
          <button className="secondary" onClick={refreshStatus}>Làm mới trạng thái</button>
        </div>

        <div className="schedule">
          <b>Đồng bộ theo yêu cầu</b>
          <small>Chọn khoảng ngày và nhấn Đồng bộ tất cả khi cần bản cập nhật.</small>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <h2>Lịch sử đồng bộ</h2>
            <p>30 tác vụ gần nhất</p>
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Khách sạn</th>
                <th>Dữ liệu</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, index) => (
                <tr key={`${log.at}-${index}`}>
                  <td>{formatDateTime(log.at)}</td>
                  <td>{log.hotelName || log.hotelId}</td>
                  <td>{log.dataset}</td>
                  <td>
                    <span className={`logStatus ${log.ok ? "ok" : "bad"}`}>
                      {log.ok ? "Thành công" : "Lỗi"}
                    </span>
                    {!log.ok && (
                      <small className="logError">
                        {typeof log.detail === "string"
                          ? log.detail
                          : log.detail?.message || "Blue Jay từ chối request"}
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
