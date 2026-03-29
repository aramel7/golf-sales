/* ═══════════════════════════════════════════════════
   골프존파크 도안빈스점 - 매출 관리 앱
   ═══════════════════════════════════════════════════ */

// ─── 상태 ─────────────────────────────────────────
let selectedRoom = null;
let selectedPayment = null;
let editingId = null;
let todayData = [];
let dailyChart = null;
let paymentChart = null;
let roomChart = null;

// ─── 초기화 ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('token')) {
    window.location.href = '/';
    return;
  }

  // 헤더 정보
  document.getElementById('headerUser').textContent = localStorage.getItem('username') || '';
  updateHeaderDate();
  setInterval(updateHeaderDate, 60000);

  // 날짜 기본값
  document.getElementById('saleDate').value = getLocalDate();

  // 방 / 결제수단 버튼 이벤트
  document.querySelectorAll('.room-btn').forEach(btn => {
    btn.addEventListener('click', () => selectRoom(parseInt(btn.dataset.room)));
  });
  document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', () => selectPayment(btn.dataset.pay));
  });

  // 금액 천단위 포맷
  document.getElementById('saleAmount').addEventListener('input', formatAmountInput);

  // 탭 내비게이션
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 매출내역 기본 날짜 (이번 달 1일 ~ 오늘)
  const today = getLocalDate();
  const monthStart = today.slice(0, 7) + '-01';
  document.getElementById('histStart').value = monthStart;
  document.getElementById('histEnd').value = today;

  // 대시보드 로드
  loadDashboard();
});

function updateHeaderDate() {
  const now = new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const str = `${now.getFullYear()}년 ${now.getMonth()+1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
  document.getElementById('headerDate').textContent = str;
}

function getLocalDate(date) {
  const d = date ? new Date(date) : new Date();
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ─── 인증 ─────────────────────────────────────────
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('username');
  window.location.href = '/';
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  if (res.status === 401) {
    logout();
    return;
  }
  return res;
}

// ─── 탭 전환 ──────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));

  if (tab === 'history') loadHistory();
  if (tab === 'stats') loadStats();
}

// ─── 방 / 결제수단 선택 ───────────────────────────
function selectRoom(room) {
  selectedRoom = room;
  document.querySelectorAll('.room-btn').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.room) === room));
}

function selectPayment(pay) {
  selectedPayment = pay;
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.toggle('selected', b.dataset.pay === pay));
}

// ─── 금액 포맷 ────────────────────────────────────
function formatAmountInput(e) {
  const raw = e.target.value.replace(/[^0-9]/g, '');
  e.target.value = raw ? parseInt(raw).toLocaleString('ko-KR') : '';
}

function getRawAmount() {
  return parseInt(document.getElementById('saleAmount').value.replace(/,/g, '') || '0');
}

function fmtWon(n) {
  return '₩' + (n || 0).toLocaleString('ko-KR');
}

function fmtPayment(p) {
  return { card: '💳 카드', cash: '💵 현금', transfer: '🏦 계좌이체' }[p] || p;
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', weekday: 'short' });
}

function payBadge(p) {
  const cls = { card: 'badge-card', cash: 'badge-cash', transfer: 'badge-transfer' }[p] || '';
  const label = { card: '카드', cash: '현금', transfer: '계좌이체' }[p] || p;
  return `<span class="badge ${cls}">${label}</span>`;
}

// ─── 대시보드 ─────────────────────────────────────
async function loadDashboard() {
  const date = document.getElementById('saleDate').value || getLocalDate();
  const res = await apiFetch(`/api/sales?date=${date}`);
  if (!res) return;
  todayData = await res.json();
  renderTodaySummary(todayData);
  renderTodayTable(todayData);
}

function renderTodaySummary(rows) {
  let total = 0, card = 0, cash = 0, transfer = 0;
  const roomMap = {};

  rows.forEach(r => {
    total += r.amount;
    if (r.payment_method === 'card') card += r.amount;
    else if (r.payment_method === 'cash') cash += r.amount;
    else transfer += r.amount;

    if (!roomMap[r.room_number]) roomMap[r.room_number] = { total: 0, count: 0 };
    roomMap[r.room_number].total += r.amount;
    roomMap[r.room_number].count += 1;
  });

  document.getElementById('summaryTotal').textContent = fmtWon(total);
  document.getElementById('summaryCount').textContent = `${rows.length}건`;
  document.getElementById('summaryCard').textContent = fmtWon(card);
  document.getElementById('summaryCash').textContent = fmtWon(cash);
  document.getElementById('summaryTransfer').textContent = fmtWon(transfer);

  const box = document.getElementById('roomSummary');
  if (Object.keys(roomMap).length === 0) {
    box.innerHTML = '<div style="color:var(--text-sub);font-size:13px;padding:8px 0">매출 없음</div>';
    return;
  }
  box.innerHTML = Object.entries(roomMap)
    .sort((a, b) => a[0] - b[0])
    .map(([room, d]) => `
      <div class="room-sum-item">
        <span class="room-sum-name">${room}번</span>
        <div style="text-align:right">
          <div class="room-sum-amount">${fmtWon(d.total)}</div>
          <div class="room-sum-count">${d.count}건</div>
        </div>
      </div>
    `).join('');
}

function renderTodayTable(rows) {
  const tbody = document.getElementById('todayBody');
  const empty = document.getElementById('todayEmpty');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${fmtTime(r.created_at)}</td>
      <td><strong>${r.room_number}번</strong></td>
      <td>${payBadge(r.payment_method)}</td>
      <td class="amount-cell">${fmtWon(r.amount)}</td>
      <td style="color:var(--text-sub)">${r.memo || '-'}</td>
      <td>
        <div class="action-btns">
          <button class="btn-edit" onclick="startEdit(${r.id})">수정</button>
          <button class="btn-del" onclick="deleteSale(${r.id})">삭제</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ─── 매출 등록 ────────────────────────────────────
async function submitSale() {
  const errorEl = document.getElementById('formError');
  errorEl.style.display = 'none';

  const date = document.getElementById('saleDate').value;
  const amount = getRawAmount();
  const memo = document.getElementById('saleMemo').value.trim();

  if (!selectedRoom) return showFormError('방을 선택해주세요');
  if (!selectedPayment) return showFormError('결제수단을 선택해주세요');
  if (!amount || amount <= 0) return showFormError('금액을 입력해주세요');

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;

  try {
    const body = { date, room_number: selectedRoom, payment_method: selectedPayment, amount, memo };

    let res;
    if (editingId) {
      res = await apiFetch(`/api/sales/${editingId}`, { method: 'PUT', body: JSON.stringify(body) });
    } else {
      res = await apiFetch('/api/sales', { method: 'POST', body: JSON.stringify(body) });
    }

    const data = await res.json();
    if (!res.ok) return showFormError(data.error);

    // 폼 초기화
    cancelEdit();
    document.getElementById('saleAmount').value = '';
    document.getElementById('saleMemo').value = '';

    // 리스트 새로고침
    await loadDashboard();
  } catch (err) {
    showFormError('등록 실패: 서버 오류');
  } finally {
    btn.disabled = false;
  }
}

function showFormError(msg) {
  const el = document.getElementById('formError');
  el.textContent = msg;
  el.style.display = 'block';
  document.getElementById('submitBtn').disabled = false;
}

// ─── 수정 ─────────────────────────────────────────
function startEdit(id) {
  const row = todayData.find(r => r.id === id);
  if (!row) return;

  editingId = id;
  selectRoom(row.room_number);
  selectPayment(row.payment_method);
  document.getElementById('saleDate').value = row.date;
  document.getElementById('saleAmount').value = row.amount.toLocaleString('ko-KR');
  document.getElementById('saleMemo').value = row.memo || '';
  document.getElementById('submitBtn').textContent = '수정하기';
  document.getElementById('cancelEditBtn').style.display = 'block';
  document.getElementById('formError').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
  editingId = null;
  selectedRoom = null;
  selectedPayment = null;
  document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.payment-btn').forEach(b => b.classList.remove('selected'));
  document.getElementById('saleDate').value = getLocalDate();
  document.getElementById('saleAmount').value = '';
  document.getElementById('saleMemo').value = '';
  document.getElementById('submitBtn').textContent = '등록하기';
  document.getElementById('cancelEditBtn').style.display = 'none';
  document.getElementById('formError').style.display = 'none';
}

// ─── 삭제 ─────────────────────────────────────────
async function deleteSale(id) {
  if (!confirm('이 매출 내역을 삭제하시겠습니까?')) return;
  const res = await apiFetch(`/api/sales/${id}`, { method: 'DELETE' });
  if (res?.ok) await loadDashboard();
  else alert('삭제 실패');
}

// ─── 매출내역 탭 ──────────────────────────────────
async function loadHistory() {
  const start = document.getElementById('histStart').value;
  const end = document.getElementById('histEnd').value;
  if (!start || !end) return;

  const res = await apiFetch(`/api/sales?start=${start}&end=${end}`);
  if (!res) return;
  const rows = await res.json();

  // 요약
  let total = 0, card = 0, cash = 0, transfer = 0;
  rows.forEach(r => {
    total += r.amount;
    if (r.payment_method === 'card') card += r.amount;
    else if (r.payment_method === 'cash') cash += r.amount;
    else transfer += r.amount;
  });
  const box = document.getElementById('histSummaryBox');
  box.style.display = rows.length ? 'flex' : 'none';
  document.getElementById('histTotal').textContent = fmtWon(total);
  document.getElementById('histCard').textContent = fmtWon(card);
  document.getElementById('histCash').textContent = fmtWon(cash);
  document.getElementById('histTransfer').textContent = fmtWon(transfer);
  document.getElementById('histCount').textContent = `${rows.length}건`;

  // 테이블
  const tbody = document.getElementById('histBody');
  const empty = document.getElementById('histEmpty');
  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${fmtTime(r.created_at)}</td>
      <td><strong>${r.room_number}번</strong></td>
      <td>${payBadge(r.payment_method)}</td>
      <td class="amount-cell">${fmtWon(r.amount)}</td>
      <td style="color:var(--text-sub)">${r.memo || '-'}</td>
    </tr>
  `).join('');

  // 엑셀용 캐시
  window._historyData = rows;
}

// ─── 엑셀 내보내기 ────────────────────────────────
function buildWorksheet(rows, title) {
  const headers = ['날짜', '시간', '방', '결제수단', '금액(원)', '메모'];
  const payLabel = { card: '카드', cash: '현금', transfer: '계좌이체' };
  const data = rows.map(r => [
    r.date,
    new Date(r.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    `${r.room_number}번`,
    payLabel[r.payment_method] || r.payment_method,
    r.amount,
    r.memo || ''
  ]);

  // 합계 행
  const total = rows.reduce((s, r) => s + r.amount, 0);
  data.push(['합계', '', '', '', total, '']);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 12 }, { wch: 20 }];
  return ws;
}

function exportToday() {
  if (!todayData || todayData.length === 0) return alert('내보낼 데이터가 없습니다');
  const date = document.getElementById('saleDate').value;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildWorksheet(todayData, date), date);
  XLSX.writeFile(wb, `매출_${date}.xlsx`);
}

function exportHistory() {
  const rows = window._historyData;
  if (!rows || rows.length === 0) return alert('조회된 데이터가 없습니다');
  const start = document.getElementById('histStart').value;
  const end = document.getElementById('histEnd').value;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildWorksheet(rows, `${start}~${end}`), '매출내역');
  XLSX.writeFile(wb, `매출내역_${start}_${end}.xlsx`);
}

// ─── 통계 탭 ──────────────────────────────────────
function onStatsPeriodChange() {
  const val = document.getElementById('statsPeriod').value;
  document.getElementById('statsCustomRange').style.display = val === 'custom' ? 'flex' : 'none';
}

async function loadStats() {
  const period = document.getElementById('statsPeriod').value;
  let start, end;
  end = getLocalDate();

  if (period === 'custom') {
    start = document.getElementById('statsStart').value;
    end = document.getElementById('statsEnd').value;
    if (!start || !end) return alert('날짜 범위를 선택해주세요');
  } else {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(period) + 1);
    start = getLocalDate(d);
  }

  const res = await apiFetch(`/api/stats?start=${start}&end=${end}`);
  if (!res) return;
  const data = await res.json();

  renderDailyChart(data.daily);
  renderPaymentChart(data.payments);
  renderRoomChart(data.rooms);
  renderStatsSummary(data);
}

function renderDailyChart(daily) {
  const ctx = document.getElementById('dailyChart').getContext('2d');
  if (dailyChart) dailyChart.destroy();
  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map(d => d.date.slice(5)),
      datasets: [
        { label: '카드', data: daily.map(d => d.card_total), backgroundColor: '#1e88e5', stack: 's' },
        { label: '현금', data: daily.map(d => d.cash_total), backgroundColor: '#fb8c00', stack: 's' },
        { label: '계좌이체', data: daily.map(d => d.transfer_total), backgroundColor: '#8e24aa', stack: 's' }
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtWon(ctx.raw)}` } } },
      scales: {
        x: { stacked: true },
        y: { stacked: true, ticks: { callback: v => fmtWon(v) } }
      }
    }
  });
}

function renderPaymentChart(payments) {
  const ctx = document.getElementById('paymentChart').getContext('2d');
  if (paymentChart) paymentChart.destroy();
  const map = { card: '카드', cash: '현금', transfer: '계좌이체' };
  const colors = { card: '#1e88e5', cash: '#fb8c00', transfer: '#8e24aa' };
  paymentChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: payments.map(p => map[p.payment_method] || p.payment_method),
      datasets: [{
        data: payments.map(p => p.total),
        backgroundColor: payments.map(p => colors[p.payment_method] || '#ccc'),
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtWon(ctx.raw)} (${ctx.parsed}원)` } }
      }
    }
  });
}

function renderRoomChart(rooms) {
  const ctx = document.getElementById('roomChart').getContext('2d');
  if (roomChart) roomChart.destroy();
  roomChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rooms.map(r => `${r.room_number}번`),
      datasets: [{
        label: '매출',
        data: rooms.map(r => r.total),
        backgroundColor: '#43a047',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${fmtWon(ctx.raw)}` } }
      },
      scales: { x: { ticks: { callback: v => fmtWon(v) } } }
    }
  });
}

function renderStatsSummary(data) {
  const totalSales = data.daily.reduce((s, d) => s + d.total, 0);
  const totalCount = data.daily.reduce((s, d) => s + d.count, 0);
  const avgDaily = data.daily.length ? Math.round(totalSales / data.daily.length) : 0;
  const bestDay = data.daily.reduce((best, d) => d.total > (best?.total || 0) ? d : best, null);
  const topRoom = data.rooms.reduce((top, r) => r.total > (top?.total || 0) ? r : top, null);

  document.getElementById('statsSummary').innerHTML = `
    <div class="stats-sum-row">
      <span class="stats-sum-label">총 매출</span>
      <span class="stats-sum-value">${fmtWon(totalSales)}</span>
    </div>
    <div class="stats-sum-row">
      <span class="stats-sum-label">총 거래 건수</span>
      <span class="stats-sum-value">${totalCount}건</span>
    </div>
    <div class="stats-sum-row">
      <span class="stats-sum-label">일평균 매출</span>
      <span class="stats-sum-value">${fmtWon(avgDaily)}</span>
    </div>
    <div class="stats-sum-row">
      <span class="stats-sum-label">최고 매출일</span>
      <span class="stats-sum-value">${bestDay ? `${bestDay.date} (${fmtWon(bestDay.total)})` : '-'}</span>
    </div>
    <div class="stats-sum-row">
      <span class="stats-sum-label">매출 1위 방</span>
      <span class="stats-sum-value">${topRoom ? `${topRoom.room_number}번 방 (${fmtWon(topRoom.total)})` : '-'}</span>
    </div>
  `;
}

// ─── 비밀번호 변경 ────────────────────────────────
function openPasswordModal() {
  document.getElementById('pwCurrent').value = '';
  document.getElementById('pwNew').value = '';
  document.getElementById('pwConfirm').value = '';
  document.getElementById('pwError').style.display = 'none';
  document.getElementById('pwModal').style.display = 'flex';
}

function closePasswordModal() {
  document.getElementById('pwModal').style.display = 'none';
}

function closePwModalOnBg(e) {
  if (e.target === document.getElementById('pwModal')) closePasswordModal();
}

async function changePassword() {
  const current = document.getElementById('pwCurrent').value;
  const newPw = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;
  const errEl = document.getElementById('pwError');
  errEl.style.display = 'none';

  if (!current || !newPw || !confirm) {
    errEl.textContent = '모든 항목을 입력해주세요';
    errEl.style.display = 'block';
    return;
  }
  if (newPw !== confirm) {
    errEl.textContent = '새 비밀번호가 일치하지 않습니다';
    errEl.style.display = 'block';
    return;
  }

  const res = await apiFetch('/api/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password: current, new_password: newPw })
  });
  const data = await res.json();
  if (!res.ok) {
    errEl.textContent = data.error;
    errEl.style.display = 'block';
    return;
  }
  alert('비밀번호가 변경되었습니다.');
  closePasswordModal();
}

// 날짜 변경 시 해당 날짜 데이터 로드
document.getElementById('saleDate')?.addEventListener('change', loadDashboard);
