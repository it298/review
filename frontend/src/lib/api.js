export async function api(path, options = {}) {
  const { headers, ...rest } = options;
  const response = await fetch((import.meta.env.VITE_API_URL || '') + path, {
    ...rest, headers: { 'Content-Type': 'application/json', ...headers }
  });
  const data = await response.json().catch(() => ({ error: 'Máy chủ trả về dữ liệu không hợp lệ.' }));
  if (!response.ok) throw new Error(data.error || 'Yêu cầu thất bại.');
  return data;
}
