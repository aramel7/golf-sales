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
let noticePanelOpen = true;
let noticeImageBase64 = '';

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

  // 공지사항 로드
  loadNotices();
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
    return null;
  }
  return res;
}

// ─── 탭 전환 ──────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));

  if (tab === 'history') loadHistory();
  if (tab === 'stats') loadStats();
  if (tab === 'coupon') loadCouponMembers();
  if (tab === 'supply') loadSupplyTab();
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

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

function roomLabel(n) {
  return n === 9 ? '기타' : `${n}번`;
}

function payBadge(p) {
  const cls = { card: 'badge-card', cash: 'badge-cash', transfer: 'badge-transfer', prepay: 'badge-prepay' }[p] || '';
  const label = { card: '카드', cash: '현금', transfer: '계좌이체', prepay: '선결제' }[p] || p;
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
  let total = 0, card = 0, cash = 0, transfer = 0, prepay = 0;
  const roomMap = {};

  rows.forEach(r => {
    total += r.amount;
    if (r.payment_method === 'card') card += r.amount;
    else if (r.payment_method === 'cash') cash += r.amount;
    else if (r.payment_method === 'transfer') transfer += r.amount;
    else if (r.payment_method === 'prepay') prepay += r.amount;

    if (!roomMap[r.room_number]) roomMap[r.room_number] = { total: 0, count: 0 };
    roomMap[r.room_number].total += r.amount;
    roomMap[r.room_number].count += 1;
  });

  document.getElementById('summaryTotal').textContent = fmtWon(total);
  document.getElementById('summaryCount').textContent = `${rows.length}건`;
  document.getElementById('summaryCard').textContent = fmtWon(card);
  document.getElementById('summaryCash').textContent = fmtWon(cash);
  document.getElementById('summaryTransfer').textContent = fmtWon(transfer);
  const prepayEl = document.getElementById('summaryPrepay');
  if (prepayEl) prepayEl.textContent = fmtWon(prepay);

  const box = document.getElementById('roomSummary');
  if (Object.keys(roomMap).length === 0) {
    box.innerHTML = '<div style="color:var(--text-sub);font-size:13px;padding:8px 0">매출 없음</div>';
    return;
  }
  box.innerHTML = Object.entries(roomMap)
    .sort((a, b) => a[0] - b[0])
    .map(([room, d]) => `
      <div class="room-sum-item">
        <span class="room-sum-name">${roomLabel(parseInt(room))}</span>
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
      <td><strong>${roomLabel(r.room_number)}</strong></td>
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
    if (!res) return;
    const data = await res.json();
    if (!res.ok) return showFormError(data.error);

    cancelEdit();
    document.getElementById('saleAmount').value = '';
    document.getElementById('saleMemo').value = '';
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
let histViewMode = 'detail';

function setHistView(mode) {
  histViewMode = mode;
  document.getElementById('hvDetail').className  = `btn btn-sm ${mode === 'detail'  ? 'btn-primary' : 'btn-outline'}`;
  document.getElementById('hvDaily').className   = `btn btn-sm ${mode === 'daily'   ? 'btn-primary' : 'btn-outline'}`;
  document.getElementById('hvMonthly').className = `btn btn-sm ${mode === 'monthly' ? 'btn-primary' : 'btn-outline'}`;
  if (window._historyData) renderHistory(window._historyData);
}

function renderHistory(rows) {
  const tbody = document.getElementById('histBody');
  const thead = document.getElementById('histTableHead');
  const empty = document.getElementById('histEmpty');

  if (rows.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  if (histViewMode === 'detail') {
    if (thead) thead.innerHTML = `<tr><th>날짜</th><th>시간</th><th>방</th><th>결제</th><th>금액</th><th>메모</th></tr>`;
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.date}</td>
        <td>${fmtTime(r.created_at)}</td>
        <td><strong>${roomLabel(r.room_number)}</strong></td>
        <td>${payBadge(r.payment_method)}</td>
        <td class="amount-cell">${fmtWon(r.amount)}</td>
        <td style="color:var(--text-sub)">${r.memo || '-'}</td>
      </tr>
    `).join('');
  } else if (histViewMode === 'daily') {
    if (thead) thead.innerHTML = `<tr><th>날짜</th><th>건수</th><th>카드</th><th>현금</th><th>계좌이체</th><th>선결제</th><th>합계</th></tr>`;
    const map = {};
    rows.forEach(r => {
      if (!map[r.date]) map[r.date] = { count:0, card:0, cash:0, transfer:0, prepay:0, total:0 };
      map[r.date].count++;
      map[r.date].total += r.amount;
      if (r.payment_method === 'card') map[r.date].card += r.amount;
      else if (r.payment_method === 'cash') map[r.date].cash += r.amount;
      else if (r.payment_method === 'transfer') map[r.date].transfer += r.amount;
      else if (r.payment_method === 'prepay') map[r.date].prepay += r.amount;
    });
    tbody.innerHTML = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).map(([date, d]) => `
      <tr>
        <td>${date}</td>
        <td>${d.count}건</td>
        <td class="amount-cell">${fmtWon(d.card)}</td>
        <td class="amount-cell">${fmtWon(d.cash)}</td>
        <td class="amount-cell">${fmtWon(d.transfer)}</td>
        <td class="amount-cell">${fmtWon(d.prepay)}</td>
        <td class="amount-cell"><strong>${fmtWon(d.total)}</strong></td>
      </tr>
    `).join('');
  } else if (histViewMode === 'monthly') {
    if (thead) thead.innerHTML = `<tr><th>월</th><th>건수</th><th>카드</th><th>현금</th><th>계좌이체</th><th>선결제</th><th>합계</th></tr>`;
    const map = {};
    rows.forEach(r => {
      const month = r.date.slice(0, 7);
      if (!map[month]) map[month] = { count:0, card:0, cash:0, transfer:0, prepay:0, total:0 };
      map[month].count++;
      map[month].total += r.amount;
      if (r.payment_method === 'card') map[month].card += r.amount;
      else if (r.payment_method === 'cash') map[month].cash += r.amount;
      else if (r.payment_method === 'transfer') map[month].transfer += r.amount;
      else if (r.payment_method === 'prepay') map[month].prepay += r.amount;
    });
    tbody.innerHTML = Object.entries(map).sort((a,b) => a[0].localeCompare(b[0])).map(([month, d]) => `
      <tr>
        <td>${month}</td>
        <td>${d.count}건</td>
        <td class="amount-cell">${fmtWon(d.card)}</td>
        <td class="amount-cell">${fmtWon(d.cash)}</td>
        <td class="amount-cell">${fmtWon(d.transfer)}</td>
        <td class="amount-cell">${fmtWon(d.prepay)}</td>
        <td class="amount-cell"><strong>${fmtWon(d.total)}</strong></td>
      </tr>
    `).join('');
  }
}

async function loadHistory() {
  const start = document.getElementById('histStart').value;
  const end = document.getElementById('histEnd').value;
  if (!start || !end) return;

  const res = await apiFetch(`/api/sales?start=${start}&end=${end}`);
  if (!res) return;
  const rows = await res.json();

  let total = 0, card = 0, cash = 0, transfer = 0, prepay = 0;
  rows.forEach(r => {
    total += r.amount;
    if (r.payment_method === 'card') card += r.amount;
    else if (r.payment_method === 'cash') cash += r.amount;
    else if (r.payment_method === 'transfer') transfer += r.amount;
    else if (r.payment_method === 'prepay') prepay += r.amount;
  });

  const box = document.getElementById('histSummaryBox');
  box.style.display = rows.length ? 'flex' : 'none';
  document.getElementById('histTotal').textContent = fmtWon(total);
  document.getElementById('histCard').textContent = fmtWon(card);
  document.getElementById('histCash').textContent = fmtWon(cash);
  document.getElementById('histTransfer').textContent = fmtWon(transfer);
  document.getElementById('histCount').textContent = `${rows.length}건`;
  const prepayEl = document.getElementById('histPrepay');
  if (prepayEl) prepayEl.textContent = fmtWon(prepay);

  window._historyData = rows;
  renderHistory(rows);
}

// ─── 엑셀 내보내기 ────────────────────────────────
function buildWorksheet(rows) {
  const headers = ['날짜', '시간', '방', '결제수단', '금액(원)', '메모'];
  const payLabel = { card: '카드', cash: '현금', transfer: '계좌이체', prepay: '선결제' };
  const data = rows.map(r => [
    r.date,
    new Date(r.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }),
    roomLabel(r.room_number),
    payLabel[r.payment_method] || r.payment_method,
    r.amount,
    r.memo || ''
  ]);
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
  XLSX.utils.book_append_sheet(wb, buildWorksheet(todayData), date);
  XLSX.writeFile(wb, `매출_${date}.xlsx`);
}

function exportHistory() {
  const rows = window._historyData;
  if (!rows || rows.length === 0) return alert('조회된 데이터가 없습니다');
  const start = document.getElementById('histStart').value;
  const end = document.getElementById('histEnd').value;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildWorksheet(rows), '매출내역');
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
        { label: '카드',     data: daily.map(d => d.card_total),     backgroundColor: '#1e88e5', stack: 's' },
        { label: '현금',     data: daily.map(d => d.cash_total),     backgroundColor: '#fb8c00', stack: 's' },
        { label: '계좌이체', data: daily.map(d => d.transfer_total), backgroundColor: '#8e24aa', stack: 's' },
        { label: '선결제',   data: daily.map(d => d.prepay_total || 0), backgroundColor: '#00838f', stack: 's' }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmtWon(ctx.raw)}` } }
      },
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
  const map = { card: '카드', cash: '현금', transfer: '계좌이체', prepay: '선결제' };
  const colors = { card: '#1e88e5', cash: '#fb8c00', transfer: '#8e24aa', prepay: '#00838f' };
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
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmtWon(ctx.raw)}` } }
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
      labels: rooms.map(r => roomLabel(r.room_number)),
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
  const avgDaily  = data.daily.length ? Math.round(totalSales / data.daily.length) : 0;
  const bestDay   = data.daily.reduce((best, d) => d.total > (best?.total || 0) ? d : best, null);
  const topRoom   = data.rooms.reduce((top, r) => r.total > (top?.total || 0) ? r : top, null);

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
      <span class="stats-sum-value">${topRoom ? `${roomLabel(topRoom.room_number)} (${fmtWon(topRoom.total)})` : '-'}</span>
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
  const newPw   = document.getElementById('pwNew').value;
  const confirm = document.getElementById('pwConfirm').value;
  const errEl   = document.getElementById('pwError');
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
  if (!res) return;
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

// ═══════════════════════════════════════════════════
// 쿠폰관리
// ═══════════════════════════════════════════════════

// ─── 상태 ─────────────────────────────────────────
let couponMembers = [];
let selectedCouponMemberId = null;
let couponEditingId = null;
let couponTicketType = 10;
let couponLogs = [];
let couponTickets = [];

// ─── 서브탭 전환 ──────────────────────────────────
function switchCouponSub(sub) {
  document.querySelectorAll('#tab-coupon .coupon-sub-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.sub === sub)
  );
  document.querySelectorAll('#tab-coupon .coupon-sub-content').forEach(c =>
    c.classList.toggle('active', c.id === `coupon-sub-${sub}`)
  );
  if (sub === 'logs') loadCouponLogs();
  if (sub === 'cstats') loadCouponStats();
}

// ─── 회원 목록 ────────────────────────────────────
async function loadCouponMembers() {
  const search = document.getElementById('couponSearch').value.trim();
  const url = search
    ? `/api/coupon/members?search=${encodeURIComponent(search)}`
    : '/api/coupon/members';
  const res = await apiFetch(url);
  if (!res) return;
  couponMembers = await res.json();
  renderCouponMembers();
}

function renderCouponMembers() {
  const tbody = document.getElementById('couponMemberBody');
  const empty = document.getElementById('couponMemberEmpty');
  if (!couponMembers.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  const today = getLocalDate();
  tbody.innerHTML = couponMembers.map(m => {
    const expired  = m.expire_date && m.expire_date < today;
    const soon     = m.expire_date && !expired &&
      (new Date(m.expire_date) - new Date(today)) / 86400000 <= 7;
    const zero     = parseInt(m.remaining) === 0;
    const selected = m.id === selectedCouponMemberId;
    const rowBg    = selected ? 'background:#e3f2fd;' : '';
    const rowColor = expired && !zero ? 'color:#e65100;' : zero ? 'color:#c62828;' : '';
    const expStyle = expired && !zero ? 'color:#e65100;font-weight:700'
                   : soon ? 'color:#f57c00;font-weight:700' : '';
    return `
      <tr style="${rowBg}${rowColor}cursor:pointer" onclick="selectCouponMember(${m.id})" id="cmrow-${m.id}">
        <td>${m.id}</td>
        <td><strong>${m.name}</strong></td>
        <td>${m.phone || '-'}</td>
        <td>${m.gender || '-'}</td>
        <td style="color:var(--text-sub)">${m.memo || '-'}</td>
        <td><strong style="color:${zero ? '#c62828' : '#2e7d32'}">${m.remaining}회</strong></td>
        <td>${m.last_purchase || '-'}</td>
        <td style="${expStyle}">${m.expire_date || '-'}</td>
      </tr>`;
  }).join('');
}

function selectCouponMember(id) {
  selectedCouponMemberId = id;
  renderCouponMembers();
}

// ─── 회원 모달 ────────────────────────────────────
function openCouponMemberModal(member = null) {
  couponEditingId = member ? member.id : null;
  document.getElementById('couponMemberModalTitle').textContent =
    member ? '회원 수정' : '신규 회원 등록';
  document.getElementById('cmName').value   = member?.name   || '';
  document.getElementById('cmPhone').value  = member?.phone  || '';
  document.getElementById('cmGender').value = member?.gender || '남';
  document.getElementById('cmMemo').value   = member?.memo   || '';
  document.getElementById('cmError').style.display = 'none';
  document.getElementById('couponMemberModal').style.display = 'flex';
}

function closeCouponMemberModal() {
  document.getElementById('couponMemberModal').style.display = 'none';
}

function closeCouponMemberModalOnBg(e) {
  if (e.target === document.getElementById('couponMemberModal')) closeCouponMemberModal();
}

async function saveCouponMember() {
  const name   = document.getElementById('cmName').value.trim();
  const phone  = document.getElementById('cmPhone').value.trim();
  const gender = document.getElementById('cmGender').value;
  const memo   = document.getElementById('cmMemo').value.trim();
  const errEl  = document.getElementById('cmError');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = '이름을 입력해주세요'; errEl.style.display = 'block'; return; }

  const res = couponEditingId
    ? await apiFetch(`/api/coupon/members/${couponEditingId}`,
        { method: 'PUT',  body: JSON.stringify({ name, phone, gender, memo }) })
    : await apiFetch('/api/coupon/members',
        { method: 'POST', body: JSON.stringify({ name, phone, gender, memo }) });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
  closeCouponMemberModal();
  await loadCouponMembers();
}

function editCouponMember() {
  if (!selectedCouponMemberId) return alert('수정할 회원을 선택해주세요');
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  if (m) openCouponMemberModal(m);
}

async function deleteCouponMember() {
  if (!selectedCouponMemberId) return alert('삭제할 회원을 선택해주세요');
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  if (!m) return;
  if (!confirm(`'${m.name}' 회원을 삭제하시겠습니까?\n이용권 및 이용 내역도 모두 삭제됩니다.`)) return;
  const res = await apiFetch(`/api/coupon/members/${selectedCouponMemberId}`, { method: 'DELETE' });
  if (res?.ok) { selectedCouponMemberId = null; await loadCouponMembers(); }
  else alert('삭제 실패');
}

// ─── 이용권 구매 모달 ─────────────────────────────
function calcCouponExpire(purchaseDate, type) {
  const d = new Date(purchaseDate);
  d.setMonth(d.getMonth() + (type === 10 ? 1 : 3));
  return getLocalDate(d);
}

function openCouponTicketModal() {
  if (!selectedCouponMemberId) return alert('이용권을 구매할 회원을 선택해주세요');
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  if (!m) return;
  couponTicketType = 10;
  document.getElementById('ctMemberName').textContent = `회원: ${m.name}`;
  document.getElementById('ctPurchaseDate').value = getLocalDate();
  document.querySelectorAll('.ticket-type-btn').forEach(b =>
    b.classList.toggle('selected', parseInt(b.dataset.type) === 10)
  );
  updateCouponExpireDisplay();
  document.getElementById('ctError').style.display = 'none';
  document.getElementById('couponTicketModal').style.display = 'flex';
}

function selectTicketType(type) {
  couponTicketType = type;
  document.querySelectorAll('.ticket-type-btn').forEach(b =>
    b.classList.toggle('selected', parseInt(b.dataset.type) === type)
  );
  updateCouponExpireDisplay();
}

function updateCouponExpireDisplay() {
  const pd = document.getElementById('ctPurchaseDate').value;
  const el = document.getElementById('ctExpireDate');
  el.textContent = pd ? calcCouponExpire(pd, couponTicketType) : '구매일을 선택하세요';
}

function closeCouponTicketModal() {
  document.getElementById('couponTicketModal').style.display = 'none';
}

function closeCouponTicketModalOnBg(e) {
  if (e.target === document.getElementById('couponTicketModal')) closeCouponTicketModal();
}

async function saveCouponTicket() {
  const purchase_date = document.getElementById('ctPurchaseDate').value;
  const errEl = document.getElementById('ctError');
  errEl.style.display = 'none';
  if (!purchase_date) {
    errEl.textContent = '구매일을 선택해주세요'; errEl.style.display = 'block'; return;
  }
  const res = await apiFetch('/api/coupon/tickets', {
    method: 'POST',
    body: JSON.stringify({ member_id: selectedCouponMemberId, ticket_type: couponTicketType, purchase_date })
  });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  alert(`✅ ${m?.name} 회원\n${couponTicketType}회권 등록\n구매일: ${purchase_date}\n만료일: ${data.expire_date}`);
  closeCouponTicketModal();
  await loadCouponMembers();
}

// ─── 이용 처리 모달 ───────────────────────────────
async function openCouponUseModal() {
  if (!selectedCouponMemberId) return alert('이용 처리할 회원을 선택해주세요');
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  if (!m) return;
  const res = await apiFetch(`/api/coupon/tickets/${selectedCouponMemberId}`);
  if (!res) return;
  couponTickets = await res.json();
  if (!couponTickets.length) {
    alert(`'${m.name}' 회원의 잔여 이용권이 없습니다.`); return;
  }
  document.getElementById('cuMemberName').textContent = `회원: ${m.name}`;
  document.getElementById('cuUsedDate').value = getLocalDate();
  document.getElementById('cuTicketSelect').innerHTML = couponTickets.map(t =>
    `<option value="${t.id}">${t.ticket_type}회권 | 잔여 ${t.remaining}회 | ${t.purchase_date} ~ ${t.expire_date}</option>`
  ).join('');
  document.getElementById('cuError').style.display = 'none';
  document.getElementById('couponUseModal').style.display = 'flex';
}

function closeCouponUseModal() {
  document.getElementById('couponUseModal').style.display = 'none';
}

function closeCouponUseModalOnBg(e) {
  if (e.target === document.getElementById('couponUseModal')) closeCouponUseModal();
}

async function saveCouponUse() {
  const ticket_id = parseInt(document.getElementById('cuTicketSelect').value);
  const used_date = document.getElementById('cuUsedDate').value;
  const errEl = document.getElementById('cuError');
  errEl.style.display = 'none';
  if (!used_date) { errEl.textContent = '이용일을 선택해주세요'; errEl.style.display = 'block'; return; }
  const res = await apiFetch('/api/coupon/use', {
    method: 'POST',
    body: JSON.stringify({ ticket_id, member_id: selectedCouponMemberId, used_date })
  });
  if (!res) return;
  const data = await res.json();
  if (!res.ok) { errEl.textContent = data.error; errEl.style.display = 'block'; return; }
  const m = couponMembers.find(m => m.id === selectedCouponMemberId);
  alert(`✅ ${m?.name} 회원\n이용일: ${used_date}\n잔여: ${data.remaining}회`);
  closeCouponUseModal();
  await loadCouponMembers();
}

// ─── 이용 내역 ────────────────────────────────────
async function loadCouponLogs() {
  const search = document.getElementById('couponLogSearch').value.trim();
  const url = search
    ? `/api/coupon/logs?search=${encodeURIComponent(search)}`
    : '/api/coupon/logs';
  const res = await apiFetch(url);
  if (!res) return;
  couponLogs = await res.json();
  const tbody = document.getElementById('couponLogBody');
  const empty = document.getElementById('couponLogEmpty');
  if (!couponLogs.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = couponLogs.map((l, i) => `
    <tr style="cursor:pointer${i%2?' background:#f9f9f9':''}" onclick="selectCouponLog(this)" data-id="${l.id}">
      <td>${l.id}</td>
      <td>${l.used_date}</td>
      <td><strong>${l.name}</strong></td>
      <td>${l.phone || '-'}</td>
      <td>${l.ticket_type}회권</td>
      <td>${l.remaining}회</td>
      <td style="color:var(--text-sub);font-size:12px">${new Date(l.created_at).toLocaleString('ko-KR')}</td>
    </tr>`).join('');
}

function selectCouponLog(tr) {
  document.querySelectorAll('#couponLogBody tr').forEach(r => r.style.background = '');
  tr.style.background = '#e3f2fd';
}

async function cancelCouponUse() {
  const sel = document.querySelector('#couponLogBody tr[style*="#e3f2fd"]');
  if (!sel) return alert('취소할 내역을 선택해주세요');
  const id  = sel.dataset.id;
  const log = couponLogs.find(l => l.id == id);
  if (!confirm(`'${log?.name}' 회원의 ${log?.used_date} 이용을 취소하시겠습니까?\n잔여 횟수가 1회 복구됩니다.`)) return;
  const res = await apiFetch(`/api/coupon/logs/${id}`, { method: 'DELETE' });
  if (res?.ok) { await loadCouponLogs(); await loadCouponMembers(); }
  else alert('취소 실패');
}

// ─── 쿠폰 통계 ────────────────────────────────────
// ═══════════════════════════════════════════════════
// 비품구매 관리
// ═══════════════════════════════════════════════════

// ─── 상태 ─────────────────────────────────────────
let supplyCategories = [];
let selectedSupplyCatId = null;
let supplyEditingId = null;
let supplyData = [];
let supplyHistData = [];
let supplyMonthChartInst = null;
let supplyCatChartInst = null;
let supplyTabLoaded = false;

// ─── 탭 초기화 ────────────────────────────────────
async function loadSupplyTab() {
  if (!supplyTabLoaded) {
    supplyTabLoaded = true;
    const today = getLocalDate();
    const ym    = today.slice(0, 7);
    document.getElementById('supplyDate').value   = today;
    document.getElementById('supplyMonth').value  = ym;
    document.getElementById('budgetMonth').value  = ym;
    document.getElementById('supHistStart').value = ym + '-01';
    document.getElementById('supHistEnd').value   = today;
  }
  await loadSupplyCategories();
}

// ─── 서브탭 전환 ──────────────────────────────────
function switchSupplySub(sub) {
  document.querySelectorAll('#tab-supply .coupon-sub-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.sub === sub)
  );
  document.querySelectorAll('#tab-supply .coupon-sub-content').forEach(c =>
    c.classList.toggle('active', c.id === `supply-sub-${sub}`)
  );
  if (sub === 'sstats')  loadSupplyStats();
  if (sub === 'sconfig') loadSupplyCatList();
}

// ─── 카테고리 ─────────────────────────────────────
async function loadSupplyCategories() {
  const res = await apiFetch('/api/supply/categories');
  if (!res) return;
  supplyCategories = await res.json();
  renderSupplyCatButtons();
  // 이력 필터 드롭다운 갱신
  const sel = document.getElementById('supHistCat');
  sel.innerHTML = '<option value="">전체</option>' +
    supplyCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  loadSupplyDashboard();
  loadSupplyItemSuggestions();
}

function renderSupplyCatButtons() {
  document.getElementById('supplyCatButtons').innerHTML = supplyCategories.map(c => {
    const sel = selectedSupplyCatId === c.id;
    return `<button class="supply-cat-btn${sel ? ' selected' : ''}"
              data-id="${c.id}"
              style="${sel ? `background:${c.color};border-color:${c.color}` : ''}"
              onclick="selectSupplyCat(${c.id})">${c.name}</button>`;
  }).join('');
}

function selectSupplyCat(id) {
  selectedSupplyCatId = selectedSupplyCatId === id ? null : id;
  document.querySelectorAll('.supply-cat-btn').forEach(b => {
    const cid = parseInt(b.dataset.id);
    const cat = supplyCategories.find(c => c.id === cid);
    const sel = cid === selectedSupplyCatId;
    b.classList.toggle('selected', sel);
    b.style.background  = sel ? cat.color : '';
    b.style.borderColor = sel ? cat.color : '';
  });
}

async function loadSupplyItemSuggestions() {
  const res = await apiFetch('/api/supply/items');
  if (!res) return;
  const items = await res.json();
  document.getElementById('supplyItemSuggest').innerHTML =
    items.map(n => `<option value="${n.replace(/"/g, '&quot;')}">`).join('');
}

// ─── 금액 자동 계산 ───────────────────────────────
function formatSupplyUnitPrice(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  el.value = raw ? parseInt(raw).toLocaleString('ko-KR') : '';
  calcSupplyAmount();
}

function calcSupplyAmount() {
  const qty = parseInt(document.getElementById('supplyQty').value) || 0;
  const up  = parseInt(document.getElementById('supplyUnitPrice').value.replace(/,/g, '')) || 0;
  document.getElementById('supplyAmountDisplay').textContent = fmtWon(qty * up);
}

// ─── 구매 등록 / 수정 ─────────────────────────────
async function submitSupplyPurchase() {
  const errEl     = document.getElementById('supplyFormError');
  errEl.style.display = 'none';
  const date      = document.getElementById('supplyDate').value;
  const item_name = document.getElementById('supplyItemName').value.trim();
  const quantity  = parseInt(document.getElementById('supplyQty').value) || 1;
  const unit_price = parseInt(document.getElementById('supplyUnitPrice').value.replace(/,/g, '')) || 0;
  const amount    = quantity * unit_price;
  const notes     = document.getElementById('supplyNotes').value.trim();

  if (!date)       { errEl.textContent = '날짜를 선택해주세요';           errEl.style.display='block'; return; }
  if (!item_name)  { errEl.textContent = '품목명을 입력해주세요';         errEl.style.display='block'; return; }
  if (amount <= 0) { errEl.textContent = '수량과 단가를 입력해주세요';    errEl.style.display='block'; return; }

  const btn = document.getElementById('supplySubmitBtn');
  btn.disabled = true;
  try {
    const body = { date, category_id: selectedSupplyCatId, item_name, quantity, unit_price, amount, notes };
    const res  = supplyEditingId
      ? await apiFetch(`/api/supply/purchases/${supplyEditingId}`, { method:'PUT',  body:JSON.stringify(body) })
      : await apiFetch('/api/supply/purchases',                    { method:'POST', body:JSON.stringify(body) });
    if (!res) return;
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error; errEl.style.display='block'; return; }
    cancelSupplyEdit();
    await loadSupplyDashboard();
    loadSupplyItemSuggestions();
  } catch { errEl.textContent = '등록 실패: 서버 오류'; errEl.style.display='block'; }
  finally { btn.disabled = false; }
}

function startSupplyEdit(id) {
  const row = supplyData.find(r => r.id === id);
  if (!row) return;
  supplyEditingId = id;
  document.getElementById('supplyDate').value      = row.date;
  document.getElementById('supplyItemName').value  = row.item_name;
  document.getElementById('supplyQty').value       = row.quantity;
  document.getElementById('supplyUnitPrice').value = row.unit_price.toLocaleString('ko-KR');
  document.getElementById('supplyAmountDisplay').textContent = fmtWon(row.amount);
  document.getElementById('supplyNotes').value     = row.notes || '';
  selectedSupplyCatId = row.category_id;
  renderSupplyCatButtons();
  document.getElementById('supplySubmitBtn').textContent         = '수정하기';
  document.getElementById('supplyCancelEditBtn').style.display   = 'block';
  document.getElementById('supplyFormError').style.display       = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelSupplyEdit() {
  supplyEditingId    = null;
  selectedSupplyCatId = null;
  renderSupplyCatButtons();
  document.getElementById('supplyDate').value      = getLocalDate();
  document.getElementById('supplyItemName').value  = '';
  document.getElementById('supplyQty').value       = '1';
  document.getElementById('supplyUnitPrice').value = '';
  document.getElementById('supplyAmountDisplay').textContent     = '₩0';
  document.getElementById('supplyNotes').value     = '';
  document.getElementById('supplySubmitBtn').textContent         = '등록하기';
  document.getElementById('supplyCancelEditBtn').style.display   = 'none';
  document.getElementById('supplyFormError').style.display       = 'none';
}

async function deleteSupplyPurchase(id) {
  if (!confirm('이 구매 내역을 삭제하시겠습니까?')) return;
  const res = await apiFetch(`/api/supply/purchases/${id}`, { method: 'DELETE' });
  if (res?.ok) await loadSupplyDashboard();
  else alert('삭제 실패');
}

// ─── 이번달 현황 ──────────────────────────────────
async function loadSupplyDashboard() {
  const ym = document.getElementById('supplyMonth').value;
  if (!ym) return;
  const res = await apiFetch(`/api/supply/purchases?year_month=${ym}`);
  if (!res) return;
  supplyData = await res.json();

  const total = supplyData.reduce((s, r) => s + r.amount, 0);
  document.getElementById('supplyTotal').textContent = fmtWon(total);
  document.getElementById('supplyCount').textContent = `${supplyData.length}건`;

  // 카테고리별 합계
  const catMap = {};
  supplyData.forEach(r => {
    const key = r.category_id || 0;
    if (!catMap[key]) catMap[key] = { name: r.category_name||'미분류', color: r.color||'#9e9e9e', total:0, count:0 };
    catMap[key].total += r.amount;
    catMap[key].count += 1;
  });
  const catBox = document.getElementById('supplyCatSummary');
  catBox.innerHTML = Object.values(catMap).length === 0
    ? '<div style="color:var(--text-sub);font-size:13px;padding:8px 0">구매 내역 없음</div>'
    : Object.values(catMap).sort((a,b) => b.total - a.total).map(c => `
        <div class="pay-row">
          <span class="pay-label" style="color:${c.color}">● ${c.name}</span>
          <span class="pay-amount">${fmtWon(c.total)}
            <span style="color:var(--text-sub);font-size:12px;font-weight:400"> ${c.count}건</span>
          </span>
        </div>`).join('');

  // 예산 바
  const bRes = await apiFetch(`/api/supply/budget/${ym}`);
  if (bRes) {
    const { budget } = await bRes.json();
    renderBudgetBar(budget, total, ym);
  }

  renderSupplyTable(supplyData);
}

function renderBudgetBar(budget, spent, ym) {
  const box = document.getElementById('supplyBudgetBox');
  if (!budget) {
    box.innerHTML = `<div style="text-align:right;font-size:12px;color:var(--text-sub);margin-bottom:10px">
      <a href="#" onclick="switchSupplySub('sconfig');document.getElementById('budgetMonth').value='${ym}';return false"
         style="color:var(--primary-mid)">월 예산 설정하기 →</a></div>`;
    return;
  }
  const pct   = Math.min(Math.round(spent / budget * 100), 100);
  const color = pct < 70 ? '#2e7d32' : pct < 90 ? '#ff9800' : '#c62828';
  box.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-sub);margin-bottom:6px">
        <span>월 예산: <strong>${fmtWon(budget)}</strong></span>
        <span style="color:${color};font-weight:700">${fmtWon(spent)} (${pct}%)</span>
      </div>
      <div class="budget-bar">
        <div class="budget-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
      ${pct >= 90 ? `<div style="color:${color};font-size:11px;font-weight:700;margin-top:4px">⚠️ 예산 ${pct >= 100 ? '초과' : '90% 도달'}</div>` : ''}
    </div>`;
}

function renderSupplyTable(rows) {
  const tbody = document.getElementById('supplyBody');
  const empty = document.getElementById('supplyEmpty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.category_name
        ? `<span class="badge" style="background:${r.color}22;color:${r.color}">${r.category_name}</span>`
        : '<span style="color:var(--text-sub)">-</span>'}</td>
      <td><strong>${r.item_name}</strong></td>
      <td style="text-align:center">${r.quantity}</td>
      <td class="amount-cell">${fmtWon(r.unit_price)}</td>
      <td class="amount-cell"><strong>${fmtWon(r.amount)}</strong></td>
      <td style="color:var(--text-sub)">${r.notes || '-'}</td>
      <td><div class="action-btns">
        <button class="btn-edit" onclick="startSupplyEdit(${r.id})">수정</button>
        <button class="btn-del"  onclick="deleteSupplyPurchase(${r.id})">삭제</button>
      </div></td>
    </tr>`).join('');
}

// ─── 구매 이력 ────────────────────────────────────
async function loadSupplyHistory() {
  const start = document.getElementById('supHistStart').value;
  const end   = document.getElementById('supHistEnd').value;
  const cat   = document.getElementById('supHistCat').value;
  if (!start || !end) return alert('날짜 범위를 선택해주세요');
  let url = `/api/supply/purchases?start=${start}&end=${end}`;
  if (cat) url += `&category_id=${cat}`;
  const res = await apiFetch(url);
  if (!res) return;
  supplyHistData = await res.json();

  const total = supplyHistData.reduce((s, r) => s + r.amount, 0);
  const box   = document.getElementById('supHistSummary');
  box.style.display = supplyHistData.length ? 'flex' : 'none';
  document.getElementById('supHistTotal').textContent = fmtWon(total);
  document.getElementById('supHistCount').textContent = `${supplyHistData.length}건`;

  const tbody = document.getElementById('supHistBody');
  const empty = document.getElementById('supHistEmpty');
  if (!supplyHistData.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = supplyHistData.map(r => `
    <tr>
      <td>${r.date}</td>
      <td>${r.category_name
        ? `<span class="badge" style="background:${r.color}22;color:${r.color}">${r.category_name}</span>`
        : '<span style="color:var(--text-sub)">-</span>'}</td>
      <td><strong>${r.item_name}</strong></td>
      <td style="text-align:center">${r.quantity}</td>
      <td class="amount-cell">${fmtWon(r.unit_price)}</td>
      <td class="amount-cell"><strong>${fmtWon(r.amount)}</strong></td>
      <td style="color:var(--text-sub)">${r.notes || '-'}</td>
    </tr>`).join('');
}

// ─── 통계 ─────────────────────────────────────────
async function loadSupplyStats() {
  const res = await apiFetch('/api/supply/stats');
  if (!res) return;
  const data = await res.json();

  // 월별 막대 차트
  const mCtx = document.getElementById('supplyMonthChart').getContext('2d');
  if (supplyMonthChartInst) supplyMonthChartInst.destroy();
  supplyMonthChartInst = new Chart(mCtx, {
    type: 'bar',
    data: {
      labels: data.monthly.map(d => d.month),
      datasets: [{ label:'구매금액', data: data.monthly.map(d => d.total),
                   backgroundColor:'#43a047', borderRadius:6 }]
    },
    options: {
      responsive: true,
      plugins: { legend:{display:false}, tooltip:{callbacks:{label: ctx => ` ${fmtWon(ctx.raw)}`}} },
      scales:  { y: { ticks:{callback: v => fmtWon(v)} } }
    }
  });

  // 카테고리 도넛 차트
  const cCtx = document.getElementById('supplyCatChart').getContext('2d');
  if (supplyCatChartInst) supplyCatChartInst.destroy();
  const catData = data.byCat.filter(c => c.total > 0);
  supplyCatChartInst = new Chart(cCtx, {
    type: 'doughnut',
    data: {
      labels: catData.map(c => c.name),
      datasets:[{ data: catData.map(c => c.total),
                  backgroundColor: catData.map(c => c.color), borderWidth:2 }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position:'bottom' },
        tooltip: { callbacks:{label: ctx => ` ${ctx.label}: ${fmtWon(ctx.raw)}`} }
      }
    }
  });

  // TOP 10 품목
  const topEl = document.getElementById('supplyTopItems');
  if (!data.topItems.length) {
    topEl.innerHTML = '<div class="empty-msg">데이터가 없습니다.</div>'; return;
  }
  const maxAmt = data.topItems[0].total_amount;
  topEl.innerHTML = data.topItems.map((item, i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <span style="font-weight:700;color:var(--text-sub);width:22px;text-align:right">${i+1}</span>
      <span style="flex:1;font-weight:600">${item.item_name}</span>
      <div style="flex:2;background:var(--border);border-radius:999px;height:8px">
        <div style="width:${Math.round(item.total_amount/maxAmt*100)}%;height:100%;
             background:var(--primary-light);border-radius:999px"></div>
      </div>
      <span style="font-weight:700;min-width:80px;text-align:right">${fmtWon(item.total_amount)}</span>
      <span style="color:var(--text-sub);font-size:12px;min-width:36px;text-align:right">${item.purchase_count}회</span>
    </div>`).join('');
}

// ─── 카테고리 관리 ────────────────────────────────
function loadSupplyCatList() {
  const list = document.getElementById('supplyCatList');
  list.innerHTML = supplyCategories.length === 0
    ? '<div style="color:var(--text-sub);padding:8px 0">카테고리가 없습니다.</div>'
    : supplyCategories.map(c => `
        <div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
          <span style="width:14px;height:14px;border-radius:50%;background:${c.color};flex-shrink:0"></span>
          <span style="flex:1;font-weight:600">${c.name}</span>
          <button class="btn-del" onclick="deleteSupplyCategory(${c.id})">삭제</button>
        </div>`).join('');
}

async function addSupplyCategory() {
  const name  = document.getElementById('newCatName').value.trim();
  const color = document.getElementById('newCatColor').value;
  if (!name) return alert('카테고리명을 입력해주세요');
  const res = await apiFetch('/api/supply/categories', {
    method: 'POST', body: JSON.stringify({ name, color })
  });
  if (!res?.ok) return alert('추가 실패');
  document.getElementById('newCatName').value = '';
  await loadSupplyCategories();
  loadSupplyCatList();
}

async function deleteSupplyCategory(id) {
  const cat = supplyCategories.find(c => c.id === id);
  if (!confirm(`'${cat?.name}' 카테고리를 삭제하시겠습니까?\n해당 카테고리의 구매 내역은 '미분류'로 변경됩니다.`)) return;
  const res = await apiFetch(`/api/supply/categories/${id}`, { method: 'DELETE' });
  if (!res?.ok) return alert('삭제 실패');
  await loadSupplyCategories();
  loadSupplyCatList();
}

// ─── 예산 설정 ────────────────────────────────────
function formatBudgetInput() {
  const el  = document.getElementById('budgetAmount');
  const raw = el.value.replace(/[^0-9]/g, '');
  el.value  = raw ? parseInt(raw).toLocaleString('ko-KR') : '';
}

async function saveBudget() {
  const ym     = document.getElementById('budgetMonth').value;
  const budget = parseInt(document.getElementById('budgetAmount').value.replace(/,/g, '')) || 0;
  if (!ym)       return alert('월을 선택해주세요');
  if (budget <= 0) return alert('예산 금액을 입력해주세요');
  const res = await apiFetch(`/api/supply/budget/${ym}`, {
    method: 'PUT', body: JSON.stringify({ budget })
  });
  if (res?.ok) alert(`✅ ${ym} 예산이 ${fmtWon(budget)}으로 저장되었습니다.`);
  else alert('예산 저장 실패');
}

// ─── 엑셀 내보내기 ────────────────────────────────
function exportSupply(type) {
  const rows = type === 'month' ? supplyData : supplyHistData;
  if (!rows?.length) return alert('내보낼 데이터가 없습니다');
  const headers = ['날짜','카테고리','품목명','수량','단가(원)','금액(원)','비고'];
  const body    = rows.map(r => [
    r.date, r.category_name||'미분류', r.item_name,
    r.quantity, r.unit_price, r.amount, r.notes||''
  ]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  body.push(['합계','','','','',total,'']);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...body]);
  ws['!cols'] = [{wch:12},{wch:12},{wch:20},{wch:6},{wch:12},{wch:12},{wch:24}];
  const wb = XLSX.utils.book_new();
  if (type === 'month') {
    const ym = document.getElementById('supplyMonth').value;
    XLSX.utils.book_append_sheet(wb, ws, `비품구매_${ym}`);
    XLSX.writeFile(wb, `비품구매_${ym}.xlsx`);
  } else {
    const s = document.getElementById('supHistStart').value;
    const e = document.getElementById('supHistEnd').value;
    XLSX.utils.book_append_sheet(wb, ws, '비품구매이력');
    XLSX.writeFile(wb, `비품구매_${s}_${e}.xlsx`);
  }
}

async function loadCouponStats() {
  const res = await apiFetch('/api/coupon/stats');
  if (!res) return;
  const data = await res.json();
  const cards = [
    { icon:'👥', title:'전체 회원',   value:`${data.total_members}명`,   color:'#1565c0' },
    { icon:'✅', title:'활성 회원',   value:`${data.active_members}명`,  color:'#2e7d32' },
    { icon:'⛳', title:'오늘 이용',   value:`${data.today_use}회`,       color:'#f9a825' },
    { icon:'📅', title:'이번 달 이용', value:`${data.month_use}회`,      color:'#7b1fa2' },
    { icon:'🎫', title:'전체 잔여',   value:`${data.total_remaining}회`, color:'#2e7d32' },
    { icon:'⚠️', title:'만료 임박',   value:`${data.expire_soon.length}명`, color:'#e65100' },
  ];
  let html = `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:20px">`;
  cards.forEach(c => {
    html += `<div class="card" style="text-align:center;border-top:3px solid ${c.color}">
      <div style="font-size:28px;margin-bottom:6px">${c.icon}</div>
      <div style="font-size:12px;color:var(--text-sub);font-weight:600">${c.title}</div>
      <div style="font-size:24px;font-weight:800;color:${c.color};margin:4px 0">${c.value}</div>
    </div>`;
  });
  html += `</div>`;

  if (data.expire_soon.length) {
    html += `<div class="card"><h3 class="card-title" style="color:#e65100">⚠️ 만료 임박 (7일 이내)</h3>`;
    data.expire_soon.forEach(m => {
      html += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <strong>${m.name}</strong>
        <span style="color:#e65100;font-weight:700">만료일: ${m.expire_date} | 잔여 ${m.remaining}회 | D-${m.days_left}</span>
      </div>`;
    });
    html += `</div>`;
  }

  if (data.expired.length) {
    html += `<div class="card mt-16"><h3 class="card-title" style="color:#c62828">🚫 만료된 이용권 (잔여 있음)</h3>`;
    data.expired.forEach(m => {
      html += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <strong>${m.name}</strong>
        <span style="color:#c62828;font-weight:700">만료일: ${m.expire_date} | 잔여 ${m.remaining}회 | 만료됨</span>
      </div>`;
    });
    html += `</div>`;
  }

  document.getElementById('couponStatsBody').innerHTML = html;
}

// ═══════════════════════════════════════════════════
// 공지사항
// ═══════════════════════════════════════════════════

async function loadNotices() {
  try {
    const res = await fetch('/api/notices', {
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    });
    const data = await res.json();
    renderNotices(data);
  } catch {
    document.getElementById('noticeList').innerHTML =
      '<div class="notice-empty">공지사항을 불러오지 못했습니다.</div>';
  }
}

function renderNotices(notices) {
  const list = document.getElementById('noticeList');
  const badge = document.getElementById('noticeCount');

  if (!notices.length) {
    list.innerHTML = '<div class="notice-empty">등록된 공지사항이 없습니다.</div>';
    badge.style.display = 'none';
    return;
  }

  badge.textContent = notices.length;
  badge.style.display = 'inline-block';

  list.innerHTML = notices.map(n => {
    const dt = new Date(n.created_at);
    const dateStr = `${dt.getFullYear()}.${String(dt.getMonth()+1).padStart(2,'0')}.${String(dt.getDate()).padStart(2,'0')} `
      + `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`;
    const imgHtml = n.image_data
      ? `<img class="notice-img" src="${n.image_data}" alt="공지 이미지" onclick="openNoticeImageFull(this.src)">`
      : '';
    return `
      <div class="notice-card" id="notice-${n.id}">
        <div class="notice-card-header">
          <div class="notice-meta">
            <span class="notice-author-badge">✍️ ${escapeHtml(n.author_name)}</span>
            <span class="notice-date">${dateStr}</span>
          </div>
          <button class="notice-del-btn" onclick="deleteNotice(${n.id})">🗑 삭제</button>
        </div>
        <div class="notice-content">${escapeHtml(n.content)}</div>
        ${imgHtml}
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function toggleNoticePanel() {
  noticePanelOpen = !noticePanelOpen;
  const list = document.getElementById('noticeList');
  const btn  = document.getElementById('noticeToggleBtn');
  list.classList.toggle('collapsed', !noticePanelOpen);
  btn.textContent = noticePanelOpen ? '▲ 접기' : '▼ 펼치기';
}

// ─── 공지 작성 모달 ───────────────────────────────
function openNoticeModal() {
  document.getElementById('noticeAuthor').value = localStorage.getItem('username') || '';
  document.getElementById('noticeContent').value = '';
  document.getElementById('noticeError').style.display = 'none';
  clearNoticeImage();
  document.getElementById('noticeModal').style.display = 'flex';
  document.getElementById('noticeAuthor').focus();
}

function closeNoticeModal() {
  document.getElementById('noticeModal').style.display = 'none';
}

function closeNoticeModalOnBg(e) {
  if (e.target === document.getElementById('noticeModal')) closeNoticeModal();
}

function previewNoticeImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  resizeImageToBase64(file, 1200, 0.82, base64 => {
    noticeImageBase64 = base64;
    const preview = document.getElementById('noticeImgPreview');
    document.getElementById('noticeImgPreviewImg').src = base64;
    preview.style.display = 'block';
  });
}

function clearNoticeImage() {
  noticeImageBase64 = '';
  document.getElementById('noticeImageInput').value = '';
  document.getElementById('noticeImgPreview').style.display = 'none';
  document.getElementById('noticeImgPreviewImg').src = '';
}

function resizeImageToBase64(file, maxPx, quality, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxPx || h > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
        else       { w = Math.round(w * maxPx / h); h = maxPx; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      callback(canvas.toDataURL('image/jpeg', quality));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function submitNotice() {
  const author  = document.getElementById('noticeAuthor').value.trim();
  const content = document.getElementById('noticeContent').value.trim();
  const errEl   = document.getElementById('noticeError');

  if (!author)  { errEl.textContent = '작성자 이름을 입력하세요.'; errEl.style.display = 'block'; return; }
  if (!content) { errEl.textContent = '공지 내용을 입력하세요.';   errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';

  try {
    const res = await fetch('/api/notices', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem('token')
      },
      body: JSON.stringify({ author_name: author, content, image_data: noticeImageBase64 })
    });
    if (!res.ok) {
      const d = await res.json();
      errEl.textContent = d.error || '등록 실패';
      errEl.style.display = 'block';
      return;
    }
    closeNoticeModal();
    loadNotices();
    if (!noticePanelOpen) toggleNoticePanel();
  } catch {
    errEl.textContent = '네트워크 오류가 발생했습니다.';
    errEl.style.display = 'block';
  }
}

async function deleteNotice(id) {
  if (!confirm('이 공지사항을 삭제할까요?')) return;
  try {
    await fetch(`/api/notices/${id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + localStorage.getItem('token') }
    });
    loadNotices();
  } catch {
    alert('삭제 실패');
  }
}

function openNoticeImageFull(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
  overlay.innerHTML = `<img src="${src}" style="max-width:95vw;max-height:95vh;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.6)">`;
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
}
