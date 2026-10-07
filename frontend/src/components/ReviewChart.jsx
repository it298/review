import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function ReviewChart({ data }) {
  const chartData = data.map(x => ({
    date: new Date(x.capturedAt).toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'}),
    reviews: Number(x.userRatingCount)
  }));

  return <div className="chart card">
    <h3>Lịch sử tổng review</h3>
    {chartData.length < 2
      ? <div className="empty">Cần ít nhất 2 lần cập nhật để hiển thị biểu đồ.</div>
      : <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="reviews" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>}
  </div>;
}
