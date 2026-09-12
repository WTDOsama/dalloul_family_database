// ===========================================================================
// التقارير والتصدير — CSV مع حماية من حقن المعادلات، و PDF عبر html2canvas+jsPDF
// متاح للموظفين والمديرين فقط (المشاهد للقراءة فقط)
// ===========================================================================
import { canExport } from './state.js';
import {
  fetchAllForExport, logAction, searchOrphansLight, searchFamiliesLight,
} from './data.js';
import {
  esc, showToast, showOverlay, hideOverlay, downloadBlob,
  ASSISTANCE_TYPE_LABELS, ORPHAN_STATUS_LABELS, HOUSING_LABELS, ECONOMIC_LABELS,
  EDUCATION_LABELS, HEALTH_LABELS, formatDate, calculateAgeFromDate,
} from './ui.js';
import { friendlyError } from './errors.js';

// ------------------------------------------------------------- حماية CSV ---
/**
 * حماية من حقن معادلات CSV/Excel: أي قيمة تبدأ بـ = + - @ أو تبويب
 * تُسبَق بعلامة اقتباس مفردة لمنع تنفيذها كمعادلة عند فتح الملف.
 */
function sanitizeCsvValue(value) {
  if (value === null || value === undefined) return '';
  let v = String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return v;
}

function csvEscape(value) {
  const v = sanitizeCsvValue(value);
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function buildCsv(headers, rows) {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return '\uFEFF' + lines.join('\r\n'); // BOM لدعم العربية في Excel
}

// ------------------------------------------------------ اختيار يتيم/أسرة ---
let pickCallback = null;

function openPicker(modalId, callback) {
  pickCallback = callback;
  document.getElementById(modalId).classList.add('show');
}

export function closePickOrphan() {
  document.getElementById('pickOrphanModal').classList.remove('show');
  pickCallback = null;
}

export function closePickFamily() {
  document.getElementById('pickFamilyModal').classList.remove('show');
  pickCallback = null;
}

export async function searchPickOrphan() {
  const term = document.getElementById('pickOrphanSearch').value;
  try {
    const results = await searchOrphansLight(term, 12);
    document.getElementById('pickOrphanResults').innerHTML = results.length
      ? results.map((o) => `
          <div class="checkbox-item" style="margin-bottom:8px;cursor:pointer;" onclick="pickOrphan('${o.id}')">
            <strong>${esc(o.orphan_code)}</strong> — ${esc(o.full_name)}
          </div>`).join('')
      : '<p class="muted">لا توجد نتائج مطابقة.</p>';
    window.pickOrphan = (id) => {
      closePickOrphan();
      pickCallback?.(id);
    };
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

export async function searchPickFamily() {
  const term = document.getElementById('pickFamilySearch').value;
  try {
    const results = await searchFamiliesLight(term, 12);
    document.getElementById('pickFamilyResults').innerHTML = results.length
      ? results.map((f) => `
          <div class="checkbox-item" style="margin-bottom:8px;cursor:pointer;" onclick="pickFamily('${f.id}')">
            <strong>${esc(f.family_code)}</strong> — ${esc(f.name)}
          </div>`).join('')
      : '<p class="muted">لا توجد نتائج مطابقة.</p>';
    window.pickFamily = (id) => {
      closePickFamily();
      pickCallback?.(id);
    };
  } catch (error) {
    showToast(friendlyError(error), 'error');
  }
}

// ---------------------------------------------------------- التوليد ---
export async function generateReport(type) {
  if (!canExport()) {
    showToast('التقارير والتصدير متاحة للموظفين والمديرين فقط.', 'error');
    return;
  }

  if (type === 'orphan') {
    openPicker('pickOrphanModal', async (id) => {
      const { viewOrphan } = await import('./orphans.js');
      await viewOrphan(id);
      showToast('استخدم زر PDF في نافذة التفاصيل لتصدير التقرير.', 'success');
    });
    return;
  }

  if (type === 'family') {
    openPicker('pickFamilyModal', async (id) => {
      const { viewFamily } = await import('./families.js');
      await viewFamily(id);
      showToast('استخدم زر الطباعة في نافذة التفاصيل لطباعة أو حفظ PDF.', 'success');
    });
    return;
  }

  if (type === 'allOrphans') return exportOrphansCsv();
  if (type === 'assistance') return exportAssistanceCsv();
}

// ------------------------------------------------------- تصدير CSV أيتام ---
async function exportOrphansCsv() {
  showOverlay();
  try {
    const rows = await fetchAllForExport(
      'orphans',
      'orphan_code, full_name, gender, birth_date, status, sponsorship_status, ' +
      'governorate, city, area, guardian_name, primary_phone, school_name, grade, ' +
      'health, has_disability, created_at, updated_at'
    );

    const headers = [
      'رقم الملف', 'الاسم الرباعي', 'الجنس', 'تاريخ الميلاد', 'العمر', 'حالة اليتم',
      'حالة الكفالة', 'المحافظة', 'المدينة', 'المنطقة', 'ولي الأمر', 'الجوال',
      'المدرسة', 'الصف', 'الحالة الصحية', 'إعاقة', 'تاريخ الإنشاء', 'آخر تحديث',
    ];
    const data = rows.map((r) => [
      r.orphan_code,
      r.full_name,
      r.gender === 'male' ? 'ذكر' : 'أنثى',
      r.birth_date || '',
      r.birth_date ? calculateAgeFromDate(r.birth_date) : '',
      ORPHAN_STATUS_LABELS[r.status] || '',
      r.sponsorship_status === 'sponsored' ? 'مكفول' : r.sponsorship_status === 'unsponsored' ? 'غير مكفول' : r.sponsorship_status === 'needs' ? 'بحاجة إلى كفيل' : '',
      r.governorate || '', r.city || '', r.area || '',
      r.guardian_name || '', r.primary_phone || '',
      r.school_name || '', r.grade || '',
      HEALTH_LABELS[r.health] || '',
      r.has_disability ? 'نعم' : 'لا',
      r.created_at || '', r.updated_at || '',
    ]);

    const filename = `orphans_report_${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(buildCsv(headers, data), filename, 'text/csv;charset=utf-8;');

    await logAction('export_csv_orphans', null, null, `تصدير تقرير جميع الأيتام (${rows.length} سجل)`);
    showToast(`تم تصدير ${rows.length} سجل بنجاح.`, 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// ----------------------------------------------------- تصدير CSV مساعدات ---
async function exportAssistanceCsv() {
  showOverlay();
  try {
    const rows = await fetchAllForExport(
      'assistance',
      'date, type, amount, notes, orphans(orphan_code, full_name)'
    );

    const headers = ['التاريخ', 'رقم ملف اليتيم', 'اسم اليتيم', 'النوع', 'المبلغ', 'ملاحظات'];
    const data = rows.map((r) => [
      r.date,
      r.orphans?.orphan_code || '',
      r.orphans?.full_name || '',
      ASSISTANCE_TYPE_LABELS[r.type] || r.type,
      r.amount ?? '',
      r.notes || '',
    ]);

    const filename = `assistance_report_${new Date().toISOString().split('T')[0]}.csv`;
    downloadBlob(buildCsv(headers, data), filename, 'text/csv;charset=utf-8;');

    await logAction('export_csv_assistance', null, null, `تصدير تقرير المساعدات (${rows.length} سجل)`);
    showToast(`تم تصدير ${rows.length} سجل بنجاح.`, 'success');
  } catch (error) {
    showToast(friendlyError(error), 'error');
  } finally {
    hideOverlay();
  }
}

// ---------------------------------------------------------------- PDF ---
/** تصدير عنصر HTML إلى ملف PDF متعدد الصفحات (يدعم العربية عبر التقاط صورة) */
export async function exportElementToPdf(element, filename, title) {
  if (!window.html2canvas || !window.jspdf) {
    showToast('مكتبات التصدير غير محمّلة. تحقق من الاتصال بالإنترنت وأعد المحاولة.', 'error');
    return;
  }
  showOverlay();
  try {
    const canvas = await window.html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgHeight = (canvas.height * pageWidth) / canvas.width;

    // ترويسة
    pdf.setFontSize(14);
    pdf.setTextColor(30, 41, 59);
    try { pdf.text(title || 'تقرير', 14, 12); } catch { /* خطوط عربية محدودة في الترويسة */ }

    let remaining = imgHeight;
    let position = 18;
    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
    remaining -= (pageHeight - position);

    while (remaining > 0) {
      position = remaining - imgHeight + 18;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pageWidth, imgHeight);
      remaining -= (pageHeight - 18);
    }

    pdf.save(filename);
    await logAction('export_pdf', null, null, `تصدير PDF: ${title || filename}`);
    showToast('تم إنشاء ملف PDF بنجاح.', 'success');
  } catch (error) {
    console.error(error);
    showToast('تعذر إنشاء ملف PDF.', 'error');
  } finally {
    hideOverlay();
  }
}
