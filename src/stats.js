// ===========================================================================
// لوحة التحكم والإحصاءات — كل الأرقام محسوبة من قاعدة البيانات الفعلية
// (نفس تصميم البطاقات والرسوم البيانية الأصلي)
// ===========================================================================
import { getDashboardStats, getStatistics, listOrphans } from './data.js';
import { esc, calculateAgeFromDate, ORPHAN_STATUS_LABELS, sponsorshipBadge } from './ui.js';

// مرجع لمكتبة الرسوم (تُحمَّل من CDN كما في النسخة الأصلية)
const ChartLib = () => window.Chart;

// ---------------------------------------------------------- لوحة التحكم ---
export async function loadDashboard() {
  const stats = await getDashboardStats();

  const cards = [
    { icon: '👶', color: 'blue', label: 'إجمالي الأيتام', value: stats.totalOrphans },
    { icon: '👦', color: 'green', label: 'الذكور', value: stats.males },
    { icon: '👧', color: 'purple', label: 'الإناث', value: stats.females },
    { icon: '👨', color: 'yellow', label: 'يتيم الأب', value: stats.fatherOrphans },
    { icon: '👩', color: 'yellow', label: 'يتيم الأم', value: stats.motherOrphans },
    { icon: '👶', color: 'red', label: 'يتيم الأب والأم', value: stats.bothOrphans },
    { icon: '✅', color: 'green', label: 'مكفولون', value: stats.sponsored },
    { icon: '❌', color: 'red', label: 'غير مكفولين', value: stats.unsponsored },
    { icon: '⚠️', color: 'yellow', label: 'بحاجة إلى كفيل', value: stats.needsSponsor },
    { icon: '👨‍👩‍👧‍👦', color: 'blue', label: 'إجمالي الأسر', value: stats.totalFamilies },
    { icon: '🏕️', color: 'red', label: 'الأسر النازحة', value: stats.displaced },
    { icon: '🤝', color: 'green', label: 'إجمالي المساعدات', value: stats.totalAssistance },
  ];

  document.getElementById('dashboardStats').innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-icon ${c.color}">${c.icon}</div>
      <div class="stat-content">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value">${Number(c.value ?? 0).toLocaleString('ar')}</div>
      </div>
    </div>
  `).join('');

  // آخر 5 أيتام مسجلين
  const { rows } = await listOrphans({ page: 1, perPage: 5 });
  if (rows.length > 0) {
    const body = rows.map((o) => `
      <tr>
        <td>${esc(o.fileNumber)}</td>
        <td>${esc(o.fullName)}</td>
        <td>${o.dateOfBirth ? calculateAgeFromDate(o.dateOfBirth) : '-'}</td>
        <td>${esc(ORPHAN_STATUS_LABELS[o.orphanStatus] || '-')}</td>
        <td>${sponsorshipBadge(o.sponsorshipStatus)}</td>
      </tr>
    `).join('');
    document.getElementById('recentOrphans').innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>رقم الملف</th>
              <th>الاسم</th>
              <th>العمر</th>
              <th>حالة اليتم</th>
              <th>الكفالة</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  } else {
    document.getElementById('recentOrphans').innerHTML = `
      <div class="empty-state">
        <p>لا توجد أيتام مسجلين بعد</p>
      </div>`;
  }
}

// ---------------------------------------------------------- الإحصاءات ---
export async function loadStatistics() {
  const st = await getStatistics();
  const container = document.getElementById('chartsContainer');
  container.innerHTML = '';

  // 1) توزيع الجنس (دائري) — كما في النسخة الأصلية
  container.innerHTML += `
    <div class="chart-container">
      <div class="chart-title">توزيع الجنس</div>
      <canvas id="genderChart"></canvas>
    </div>`;

  // 2) حالة اليتم (دونات) — كما في النسخة الأصلية
  container.innerHTML += `
    <div class="chart-container">
      <div class="chart-title">حالة اليتم</div>
      <canvas id="orphanStatusChart"></canvas>
    </div>`;

  // 3) حالة الكفالة (أعمدة) — كما في النسخة الأصلية
  container.innerHTML += `
    <div class="chart-container">
      <div class="chart-title">حالة الكفالة</div>
      <canvas id="sponsorshipChart"></canvas>
    </div>`;

  // 4) الفئات العمرية (أعمدة) — إضافة تدعم اتخاذ القرار
  container.innerHTML += `
    <div class="chart-container">
      <div class="chart-title">توزيع الفئات العمرية</div>
      <canvas id="ageGroupsChart"></canvas>
    </div>`;

  destroyChart('genderChart');
  new (ChartLib())(document.getElementById('genderChart'), {
    type: 'pie',
    data: {
      labels: ['ذكور', 'إناث'],
      datasets: [{ data: [st.gender.male, st.gender.female], backgroundColor: ['#3b82f6', '#a855f7'] }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  destroyChart('orphanStatusChart');
  new (ChartLib())(document.getElementById('orphanStatusChart'), {
    type: 'doughnut',
    data: {
      labels: ['يتيم الأب', 'يتيم الأم', 'يتيم الأب والأم'],
      datasets: [{
        data: [st.orphanStatus.father, st.orphanStatus.mother, st.orphanStatus.both],
        backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
      }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });

  destroyChart('sponsorshipChart');
  new (ChartLib())(document.getElementById('sponsorshipChart'), {
    type: 'bar',
    data: {
      labels: ['مكفول', 'غير مكفول', 'بحاجة إلى كفيل'],
      datasets: [{
        label: 'العدد',
        data: [st.sponsorship.sponsored, st.sponsorship.unsponsored, st.sponsorship.needs],
        backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });

  destroyChart('ageGroupsChart');
  new (ChartLib())(document.getElementById('ageGroupsChart'), {
    type: 'bar',
    data: {
      labels: ['0-5 سنوات', '6-12 سنة', '13-18 سنة', 'أكبر من 18'],
      datasets: [{
        label: 'العدد',
        data: [st.ageGroups.g0_5, st.ageGroups.g6_12, st.ageGroups.g13_18, st.ageGroups.g18p],
        backgroundColor: ['#06b6d4', '#2563eb', '#9333ea', '#64748b'],
      }],
    },
    options: { responsive: true, plugins: { legend: { display: false } } },
  });
}

function destroyChart(id) {
  if (window.Chart?.getChart) {
    const existing = window.Chart.getChart(document.getElementById(id));
    if (existing) existing.destroy();
  }
}
