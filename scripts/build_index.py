#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Transforms the original single-file app (docs/original_dalloul_family_2026.html)
into the online full-stack index.html:
 - keeps ALL existing CSS/layout/Arabic text/design untouched
 - removes Dexie (IndexedDB) and unused emoji-button CDN
 - login becomes email-based (Supabase Auth) + first-admin setup + forgot password
 - adds: activity-log nav item, assistance/followup/logs pages, family modal,
   view modals, user management, pagination containers, print support
 - removes the old inline <script> (replaced by /src/*.js modules)
"""
import re, sys

SRC = "docs/original_dalloul_family_2026.html"
DST = "index.html"

html = open(SRC, encoding="utf-8").read()
count_replacements = 0

def rep(old, new, label, required=True):
    global html, count_replacements
    if old not in html:
        if required:
            raise SystemExit(f"ANCHOR NOT FOUND ({label}):\n{old[:200]}")
        return
    if html.count(old) != 1 and required:
        raise SystemExit(f"ANCHOR NOT UNIQUE ({label}) x{html.count(old)}")
    html = html.replace(old, new, 1)
    count_replacements += 1

# ---------------------------------------------------------------- 1. head libs
rep('    <script src="https://cdn.jsdelivr.net/npm/dexie@3.2.4/dist/dexie.min.js"></script>\n',
    '', 'remove dexie')
rep('    <script src="https://cdn.jsdelivr.net/npm/@joeattardi/emoji-button@4.6.4/dist/index.min.js"></script>\n',
    '', 'remove emoji-button (unused)')

# ---------------------------------------------------------------- 2. extra css
EXTRA_CSS = """
        /* ===== إضافات النسخة الإلكترونية (قاعدة بيانات أونلاين) ===== */
        .pagination {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            margin-top: 16px;
            flex-wrap: wrap;
        }

        .pagination button {
            min-width: 38px;
        }

        .pagination .page-info {
            font-size: 13px;
            color: var(--text-secondary);
            margin: 0 10px;
        }

        .badge-secondary {
            background: #e2e8f0;
            color: #334155;
        }

        .muted {
            color: var(--text-secondary);
            font-size: 13px;
        }

        .inline-note {
            background: #eff6ff;
            border: 1px solid #bfdbfe;
            color: #1e40af;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 20px;
            font-size: 14px;
        }

        .link-btn {
            background: none;
            border: none;
            color: var(--primary-color);
            cursor: pointer;
            font-family: inherit;
            font-size: 14px;
            padding: 4px 8px;
            text-decoration: underline;
        }

        .copy-box {
            background: var(--bg-color);
            border: 1px dashed var(--border-color);
            border-radius: 8px;
            padding: 12px;
            word-break: break-all;
            font-size: 12px;
            direction: ltr;
            text-align: left;
            margin-top: 8px;
        }

        @media print {
            body.print-mode .app-container,
            body.print-mode .login-page {
                display: none !important;
            }

            body.print-mode .modal {
                display: block !important;
                position: static;
                background: none;
                padding: 0;
            }

            body.print-mode .modal-content {
                max-width: 100%;
                box-shadow: none;
            }

            body.print-mode .modal-header .modal-close,
            body.print-mode .modal-footer,
            body.print-mode .no-print {
                display: none !important;
            }
        }
    </style>"""
rep('    </style>', EXTRA_CSS, 'extra css')

# ---------------------------------------------------------------- 3. login form
rep("""                <div class="form-group">
                    <label for="username">اسم المستخدم</label>
                    <input type="text" id="username" name="username" required autocomplete="username">
                </div>""",
    """                <div class="form-group">
                    <label for="email">البريد الإلكتروني</label>
                    <input type="email" id="email" name="email" required autocomplete="username" dir="ltr">
                </div>""", 'email field')

rep("""                <button type="submit" class="btn btn-primary btn-lg">
                    تسجيل الدخول
                </button>
            </form>""",
    """                <button type="submit" class="btn btn-primary btn-lg">
                    تسجيل الدخول
                </button>
            </form>

            <p class="text-center mt-4 mb-0">
                <a href="#" onclick="showForgotPassword(); return false;" style="color: var(--primary-color); font-size: 14px; text-decoration: none;">نسيت كلمة المرور؟</a>
            </p>

            <!-- لوحة إنشاء حساب المدير الأول (تظهر مرة واحدة فقط عند أول تشغيل للنظام) -->
            <form id="setupForm" class="hidden">
                <div id="setupAlert" class="alert alert-error"></div>
                <div class="form-group">
                    <label for="setupFullName">الاسم الكامل *</label>
                    <input type="text" id="setupFullName" required>
                </div>
                <div class="form-group">
                    <label for="setupEmail">البريد الإلكتروني *</label>
                    <input type="email" id="setupEmail" required dir="ltr">
                </div>
                <div class="form-group">
                    <label for="setupPassword">كلمة المرور *</label>
                    <div class="password-wrapper">
                        <input type="password" id="setupPassword" required minlength="6" autocomplete="new-password">
                    </div>
                </div>
                <div class="form-group">
                    <label for="setupConfirmPassword">تأكيد كلمة المرور *</label>
                    <input type="password" id="setupConfirmPassword" required minlength="6" autocomplete="new-password">
                </div>
                <button type="submit" class="btn btn-primary btn-lg">
                    إنشاء حساب المدير الأول
                </button>
                <p class="muted text-center mt-4 mb-0">
                    هذه الشاشة متاحة فقط عندما لا يوجد أي حساب مدير في النظام، وتُغلق تلقائياً بعد الإنشاء.
                </p>
            </form>

            <!-- لوحة استعادة كلمة المرور -->
            <form id="forgotForm" class="hidden">
                <div id="forgotAlert" class="alert alert-success"></div>
                <div class="form-group">
                    <label for="forgotEmail">البريد الإلكتروني</label>
                    <input type="email" id="forgotEmail" required dir="ltr">
                </div>
                <button type="submit" class="btn btn-primary btn-lg">
                    إرسال رابط الاستعادة
                </button>
                <button type="button" class="btn btn-secondary btn-lg" onclick="showLogin()" style="width: 100%; margin-top: 10px;">
                    رجوع لتسجيل الدخول
                </button>
            </form>

            <!-- لوحة حساب بانتظار التفعيل -->
            <div id="pendingPanel" class="hidden" style="text-align: center;">
                <div class="alert alert-warning show" style="display: block; background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">
                    حسابك مُسجّل لكنه بانتظار تفعيله من قبل مدير النظام.
                </div>
                <button class="btn btn-secondary" onclick="retryPending()">إعادة المحاولة</button>
                <button class="btn btn-primary" onclick="logout()">تسجيل الخروج</button>
            </div>""", 'login extras')

# ---------------------------------------------------------------- 4. login warning
rep("""            <div class="warning-box mt-4">
                <strong>تنبيه مهم:</strong>
                <p>هذا النظام يعمل بتخزين محلي داخل المتصفح. لا يتم إرسال البيانات إلى خادم خارجي. يُنصح بعمل نسخة احتياطية دورية وعدم حذف بيانات المتصفح قبل أخذ نسخة احتياطية.</p>
            </div>""",
    """            <div class="warning-box mt-4">
                <strong>نظام مؤمَّن:</strong>
                <p>البيانات محفوظة في قاعدة بيانات PostgreSQL آمنة على الإنترنت (Supabase) مع تسجيل دخول وصلاحيات لكل مستخدم. لا تُخزَّل أي بيانات حساسة داخل المتصفح.</p>
            </div>""", 'login warning')

# ---------------------------------------------------------------- 5. sidebar nav ids + logs item
rep("""                <li class="nav-item">
                    <a class="nav-link" onclick="navigateTo('statistics')">
                        <span>📈</span>
                        <span>الإحصاءات</span>
                    </a>
                </li>""",
    """                <li class="nav-item">
                    <a class="nav-link" onclick="navigateTo('statistics')">
                        <span>📈</span>
                        <span>الإحصاءات</span>
                    </a>
                </li>
                <li class="nav-item" id="navLogs" style="display: none;">
                    <a class="nav-link" onclick="navigateTo('logs')">
                        <span>📜</span>
                        <span>سجل النشاط</span>
                    </a>
                </li>""", 'logs nav item')

rep("""                <li class="nav-item">
                    <a class="nav-link" onclick="navigateTo('reports')">""",
    """                <li class="nav-item" id="navReports" style="display: none;">
                    <a class="nav-link" onclick="navigateTo('reports')">""", 'reports nav id')

rep("""                <li class="nav-item">
                    <a class="nav-link" onclick="navigateTo('backup')">""",
    """                <li class="nav-item" id="navBackup" style="display: none;">
                    <a class="nav-link" onclick="navigateTo('backup')">""", 'backup nav id')

# ---------------------------------------------------------------- 6. user role dynamic
rep('<div class="user-role">مدير النظام</div>',
    '<div class="user-role" id="userRole">مدير النظام</div>', 'user role id')

# ---------------------------------------------------------------- 7. orphans search row
rep("""                    <div class="search-row">
                        <div class="form-group mb-0">
                            <input type="text" id="searchInput" placeholder="بحث برقم الملف، الاسم، الأسرة، الجوال..." onkeyup="searchOrphans()">
                        </div>
                    </div>""",
    """                    <div class="search-row">
                        <div class="form-group mb-0" style="grid-column: span 2;">
                            <input type="text" id="searchInput" placeholder="بحث بالاسم، رقم الملف، الهوية، الأسرة، ولي الأمر، الجوال، المنطقة..." onkeyup="searchOrphans()">
                        </div>
                        <div class="form-group mb-0">
                            <select id="orphansPerPage" onchange="changeOrphansPerPage(this.value)">
                                <option value="10">10 صفوف</option>
                                <option value="20" selected>20 صف</option>
                                <option value="50">50 صف</option>
                                <option value="100">100 صف</option>
                            </select>
                        </div>
                    </div>""", 'orphans search row')

# ---------------------------------------------------------------- 8. orphans pagination
rep("""                            <tbody id="orphansTableBody">
                                <!-- Data will be populated dynamically -->
                            </tbody>
                        </table>
                    </div>""",
    """                            <tbody id="orphansTableBody">
                                <!-- Data will be populated dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div id="orphansPagination" class="pagination"></div>""", 'orphans pagination')

# ---------------------------------------------------------------- 9. families page
rep("""            <div id="familiesPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">إدارة الأسر</h2>
                        <button class="btn btn-primary" onclick="openFamilyForm()">
                            + إضافة أسرة
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="familiesTable">
                            <thead>
                                <tr>
                                    <th>اسم الأسرة</th>
                                    <th>عدد الأفراد</th>
                                    <th>عدد الأيتام</th>
                                    <th>الحالة الاقتصادية</th>
                                    <th>النزوح</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="familiesTableBody">
                                <!-- Data will be populated dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div id="familiesEmptyState" class="empty-state hidden">
                        <div class="empty-state-icon">👨‍‍👧‍👦</div>
                        <h3>لا توجد أسر مسجلة حتى الآن</h3>
                        <button class="btn btn-primary mt-4" onclick="openFamilyForm()">
                            + إضافة أسرة
                        </button>
                    </div>
                </div>
            </div>""",
    """            <div id="familiesPage" class="page-content hidden">
                <div class="search-filters">
                    <div class="search-row">
                        <div class="form-group mb-0" style="grid-column: span 2;">
                            <input type="text" id="familySearchInput" placeholder="بحث باسم الأسرة، رمز الأسرة، ولي الأمر، الجوال، المنطقة..." onkeyup="searchFamilies()">
                        </div>
                        <div class="form-group mb-0">
                            <select id="familiesPerPage" onchange="changeFamiliesPerPage(this.value)">
                                <option value="10">10 صفوف</option>
                                <option value="20" selected>20 صف</option>
                                <option value="50">50 صف</option>
                            </select>
                        </div>
                        <div class="form-group mb-0">
                            <button class="btn btn-secondary btn-sm" onclick="clearFamilyFilters()">مسح الفلاتر</button>
                        </div>
                    </div>
                </div>

                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">إدارة الأسر</h2>
                        <div class="action-buttons perm-edit">
                            <button class="btn btn-primary" onclick="openFamilyForm()">
                                + إضافة أسرة
                            </button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="familiesTable">
                            <thead>
                                <tr>
                                    <th>اسم الأسرة</th>
                                    <th>رمز الأسرة</th>
                                    <th>ولي الأمر</th>
                                    <th>الجوال</th>
                                    <th>المنطقة</th>
                                    <th>عدد الأيتام</th>
                                    <th>الحالة الاقتصادية</th>
                                    <th>النزوح</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="familiesTableBody">
                                <!-- Data will be populated dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div id="familiesPagination" class="pagination"></div>
                    <div id="familiesEmptyState" class="empty-state hidden">
                        <div class="empty-state-icon">👨‍‍👧‍👦</div>
                        <h3>لا توجد أسر مسجلة حتى الآن</h3>
                        <button class="btn btn-primary mt-4 perm-edit" onclick="openFamilyForm()">
                            + إضافة أسرة
                        </button>
                    </div>
                </div>
            </div>

            <!-- Assistance Page -->
            <div id="assistancePage" class="page-content hidden">
                <div class="search-filters">
                    <div class="search-row">
                        <div class="form-group mb-0" style="grid-column: span 2;">
                            <input type="text" id="assistanceSearch" placeholder="بحث باسم اليتيم أو رقم الملف..." onkeyup="searchAssistance()">
                        </div>
                        <div class="form-group mb-0">
                            <select id="assistanceTypeFilter" onchange="loadAssistance()">
                                <option value="">نوع المساعدة (الكل)</option>
                                <option value="material">عينية</option>
                                <option value="food">غذائية</option>
                                <option value="cash">مالية</option>
                                <option value="medical">طبية</option>
                                <option value="education">تعليمية</option>
                                <option value="housing">سكنية</option>
                                <option value="other">أخرى</option>
                            </select>
                        </div>
                        <div class="form-group mb-0">
                            <button class="btn btn-secondary btn-sm" onclick="clearAssistanceFilters()">مسح الفلاتر</button>
                        </div>
                    </div>
                </div>
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">سجل المساعدات</h2>
                        <div class="action-buttons perm-edit">
                            <button class="btn btn-primary" onclick="openAssistanceForm()">+ إضافة مساعدة</button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="assistanceTable">
                            <thead>
                                <tr>
                                    <th>اليتيم</th>
                                    <th>رقم الملف</th>
                                    <th>التاريخ</th>
                                    <th>النوع</th>
                                    <th>المبلغ</th>
                                    <th>ملاحظات</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="assistanceTableBody"></tbody>
                        </table>
                    </div>
                    <div id="assistancePagination" class="pagination"></div>
                    <div id="assistanceEmptyState" class="empty-state hidden">
                        <div class="empty-state-icon">🤝</div>
                        <h3>لا توجد مساعدات مسجلة حتى الآن</h3>
                        <button class="btn btn-primary mt-4 perm-edit" onclick="openAssistanceForm()">+ إضافة مساعدة</button>
                    </div>
                </div>
            </div>

            <!-- Follow-up Page -->
            <div id="followupPage" class="page-content hidden">
                <div class="search-filters">
                    <div class="search-row">
                        <div class="form-group mb-0" style="grid-column: span 2;">
                            <input type="text" id="followupSearch" placeholder="بحث باسم اليتيم أو رقم الملف..." onkeyup="searchFollowup()">
                        </div>
                        <div class="form-group mb-0">
                            <select id="followupFilter" onchange="loadFollowups()">
                                <option value="">عرض (الكل)</option>
                                <option value="upcoming">متابعات قادمة</option>
                            </select>
                        </div>
                        <div class="form-group mb-0">
                            <button class="btn btn-secondary btn-sm" onclick="clearFollowupFilters()">مسح الفلاتر</button>
                        </div>
                    </div>
                </div>
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">سجل المتابعة</h2>
                        <div class="action-buttons perm-edit">
                            <button class="btn btn-primary" onclick="openFollowupForm()">+ إضافة متابعة</button>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="followupsTable">
                            <thead>
                                <tr>
                                    <th>اليتيم</th>
                                    <th>رقم الملف</th>
                                    <th>تاريخ المتابعة</th>
                                    <th>الملاحظات</th>
                                    <th>المتابعة القادمة</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="followupsTableBody"></tbody>
                        </table>
                    </div>
                    <div id="followupsPagination" class="pagination"></div>
                    <div id="followupsEmptyState" class="empty-state hidden">
                        <div class="empty-state-icon">📋</div>
                        <h3>لا توجد متابعات مسجلة حتى الآن</h3>
                        <button class="btn btn-primary mt-4 perm-edit" onclick="openFollowupForm()">+ إضافة متابعة</button>
                    </div>
                </div>
            </div>

            <!-- Activity Logs Page (Admin) -->
            <div id="logsPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">سجل النشاط</h2>
                        <div class="action-buttons">
                            <select id="logActionFilter" onchange="changeLogFilter(this.value)">
                                <option value="">كل الإجراءات</option>
                                <option value="login">تسجيل دخول</option>
                                <option value="logout">تسجيل خروج</option>
                                <option value="create">إضافة</option>
                                <option value="update">تعديل</option>
                                <option value="delete">حذف</option>
                                <option value="user">إدارة المستخدمين</option>
                                <option value="export">تصدير</option>
                                <option value="import">استيراد</option>
                                <option value="security">أمان</option>
                            </select>
                        </div>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="logsTable">
                            <thead>
                                <tr>
                                    <th>الوقت</th>
                                    <th>المستخدم</th>
                                    <th>الإجراء</th>
                                    <th>الكيان</th>
                                    <th>الوصف</th>
                                </tr>
                            </thead>
                            <tbody id="logsTableBody"></tbody>
                        </table>
                    </div>
                    <div id="logsPagination" class="pagination"></div>
                    <div id="logsEmptyState" class="empty-state hidden">
                        <div class="empty-state-icon">📜</div>
                        <h3>لا توجد سجلات نشاط</h3>
                    </div>
                </div>
            </div>""", 'families + new pages')

# ---------------------------------------------------------------- 10. orphan form extras
rep("""                                <div class="form-row">
                                    <div class="form-group">
                                        <label>اسم الأب</label>
                                        <input type="text" id="fatherName">""",
    """                                <div class="form-row">
                                    <div class="form-group">
                                        <label>رقم الهوية (اختياري)</label>
                                        <input type="text" id="nationalId" dir="ltr" inputmode="numeric" maxlength="9" placeholder="9 أرقام">
                                    </div>
                                    <div class="form-group">
                                        <label>ملاحظات</label>
                                        <textarea id="orphanNotes" rows="1"></textarea>
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>اسم الأب</label>
                                        <input type="text" id="fatherName">""", 'national id field')

rep("""                                    <div class="form-group">
                                        <label>اسم الأسرة *</label>
                                        <input type="text" id="familyName" required>
                                    </div>""",
    """                                    <div class="form-group">
                                        <label>اسم الأسرة *</label>
                                        <input type="text" id="familyName" list="familyDatalist" required>
                                        <datalist id="familyDatalist"></datalist>
                                        <small class="muted">ستُنشأ الأسرة تلقائياً إذا لم تكن مسجلة.</small>
                                    </div>""", 'family datalist')

# ---------------------------------------------------------------- 11. settings page
rep("""            <!-- Settings Page -->
            <div id="settingsPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">إعدادات المدير</h2>
                    </div>
                    
                    <div class="warning-box">
                        <strong>تنبيه أمني:</strong>
                        <p>هذا النظام يعمل بتخزين محلي داخل المتصفح. لا يتم إرسال البيانات إلى خادم خارجي. يُنصح بعمل نسخة احتياطية دورية وعدم حذف بيانات المتصفح قبل أخذ نسخة احتياطية.</p>
                    </div>

                    <h3 class="section-title">تغيير بيانات الدخول</h3>
                    <form id="changePasswordForm" onsubmit="changePassword(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>اسم المستخدم الجديد</label>
                                <input type="text" id="newUsername" required>
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>كلمة المرور الجديدة</label>
                                <input type="password" id="newPassword" required minlength="6">
                            </div>
                            <div class="form-group">
                                <label>تأكيد كلمة المرور</label>
                                <input type="password" id="confirmPassword" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            تحديث البيانات
                        </button>
                    </form>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">معلومات التخزين</h3>
                    <div id="storageInfo">
                        <!-- Will be populated dynamically -->
                    </div>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">البيانات التجريبية</h3>
                    <button class="btn btn-warning" onclick="addDemoData()">
                        إضافة بيانات تجريبية
                    </button>
                    <p style="margin-top: 12px; color: var(--text-secondary); font-size: 14px;">
                        سيتم إضافة بيانات وهمية للتجربة فقط
                    </p>
                </div>
            </div>""",
    """            <!-- Settings Page -->
            <div id="settingsPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">معلومات الحساب</h2>
                    </div>
                    <div class="info-grid" id="accountInfo">
                        <!-- Will be populated dynamically -->
                    </div>
                </div>

                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">تغيير كلمة المرور</h2>
                    </div>
                    <form id="changePasswordForm" onsubmit="changePassword(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>كلمة المرور الجديدة</label>
                                <input type="password" id="newPassword" required minlength="6" autocomplete="new-password">
                            </div>
                            <div class="form-group">
                                <label>تأكيد كلمة المرور</label>
                                <input type="password" id="confirmPassword" required minlength="6" autocomplete="new-password">
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            تحديث كلمة المرور
                        </button>
                    </form>
                    <p class="muted mt-4">تُدار كلمات المرور بشكل آمن عبر Supabase Auth ولا يتم تخزينها في قاعدة بيانات التطبيق.</p>
                </div>

                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">الاسم المعروض</h2>
                    </div>
                    <form id="displayNameForm" onsubmit="updateDisplayName(event)">
                        <div class="form-row">
                            <div class="form-group">
                                <label>الاسم المعروض</label>
                                <input type="text" id="displayNameInput" required>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">
                            حفظ الاسم
                        </button>
                    </form>
                </div>

                <div class="content-card hidden" id="userManagementCard">
                    <div class="card-header">
                        <h2 class="card-title">إدارة المستخدمين والصلاحيات</h2>
                        <button class="btn btn-primary" onclick="openUserModal()">
                            + إضافة مستخدم
                        </button>
                    </div>
                    <div class="table-responsive">
                        <table class="data-table" id="usersTable">
                            <thead>
                                <tr>
                                    <th>الاسم</th>
                                    <th>اسم المستخدم</th>
                                    <th>البريد الإلكتروني</th>
                                    <th>الدور</th>
                                    <th>الحالة</th>
                                    <th>آخر دخول</th>
                                    <th>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody"></tbody>
                        </table>
                    </div>
                    <p class="muted mt-4">تتم إدارة المستخدمين عبر واجهة خادم آمنة (Server API) ولا يتم كشف أي مفاتيح خاصة في المتصفح. الأدوار المتاحة: مدير / موظف (إضافة وتعديل) / مشاهد (قراءة فقط).</p>
                </div>

                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">معلومات النظام وقاعدة البيانات</h2>
                    </div>
                    <div id="storageInfo">
                        <!-- Will be populated dynamically -->
                    </div>
                    <p class="muted mt-4">قاعدة البيانات: Supabase PostgreSQL مع حماية على مستوى الصفوف (RLS). النسخ الاحتياطي الكامل لقاعدة البيانات يتم عبر Supabase، والتصدير من التطبيق هو تصدير لبيانات التطبيق فقط.</p>
                </div>
            </div>""", 'settings page')

# ---------------------------------------------------------------- 12. backup page
rep("""            <!-- Backup Page -->
            <div id="backupPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">النسخ الاحتياطي والبيانات</h2>
                    </div>

                    <div class="warning-box">
                        <strong>تحذير:</strong>
                        <p>جميع المعلومات تُحفظ محلياً على هذا الجهاز/المتصفح. قم دائماً بإنشاء نسخة احتياطية قبل مسح بيانات المتصفح أو تغيير الجهاز.</p>
                    </div>

                    <h3 class="section-title">تصدير البيانات</h3>
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        قم بتصدير جميع البيانات إلى ملف JSON
                    </p>
                    <button class="btn btn-primary" onclick="exportData()">
                        📥 تصدير نسخة احتياطية
                    </button>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">استعادة البيانات</h3>
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        استيراد بيانات من نسخة احتياطية سابقة
                    </p>
                    <div class="file-upload" onclick="document.getElementById('importFile').click()">
                        <input type="file" id="importFile" accept=".json" onchange="importData(event)" style="display: none;">
                        <div style="font-size: 48px; margin-bottom: 12px;">📤</div>
                        <div>انقر هنا لاختيار ملف النسخة الاحتياطية</div>
                    </div>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">حذف جميع البيانات</h3>
                    <div class="warning-box" style="background: #fee2e2; border-color: #ef4444;">
                        <strong style="color: #991b1b;">تحذير خطير:</strong>
                        <p style="color: #7f1d1d;">سيتم حذف جميع البيانات المحلية نهائياً من هذا المتصفح. تأكد من وجود نسخة احتياطية قبل المتابعة.</p>
                    </div>
                    <button class="btn btn-danger" onclick="confirmClearAll()">
                        🗑️ حذف جميع البيانات
                    </button>
                </div>
            </div>""",
    """            <!-- Backup Page -->
            <div id="backupPage" class="page-content hidden">
                <div class="content-card">
                    <div class="card-header">
                        <h2 class="card-title">النسخ الاحتياطي والبيانات</h2>
                    </div>

                    <div class="inline-note">
                        البيانات محفوظة في قاعدة بيانات PostgreSQL آمنة عبر الإنترنت (Supabase).<br>
                        <strong>تصدير التطبيق ليس نسخة احتياطية كاملة لقاعدة البيانات</strong> — النسخ الاحتياطي الكامل (Disaster Recovery) مسؤولية منصة Supabase، أما التصدير أدناه فهو لتصدير بيانات التطبيق أو أرشفتها.
                    </div>

                    <h3 class="section-title">تصدير بيانات التطبيق (JSON)</h3>
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        تصدير جميع الأيتام والأسر والمساعدات والمتابعات إلى ملف JSON — للمدير فقط
                    </p>
                    <button class="btn btn-primary" onclick="exportData()">
                        📥 تصدير بيانات التطبيق
                    </button>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">ترحيل بيانات النسخة القديمة (المحلية)</h3>
                    <p style="margin-bottom: 16px; color: var(--text-secondary);">
                        استيراد ملف JSON من النسخة القديمة التي كانت تعمل بالتخزين المحلي. يتم فحص السجلات وتجاهل المكرر — للمدير فقط
                    </p>
                    <div class="file-upload" onclick="document.getElementById('importFile').click()">
                        <input type="file" id="importFile" accept=".json" onchange="importData(event)" style="display: none;">
                        <div style="font-size: 48px; margin-bottom: 12px;">📤</div>
                        <div>انقر هنا لاختيار ملف النسخة الاحتياطية القديمة</div>
                    </div>

                    <hr style="margin: 32px 0; border: none; border-top: 1px solid var(--border-color);">

                    <h3 class="section-title">حذف جميع البيانات</h3>
                    <div class="warning-box" style="background: #fee2e2; border-color: #ef4444;">
                        <strong style="color: #991b1b;">تحذير خطير:</strong>
                        <p style="color: #7f1d1d;">سيتم حذف جميع سجلات الأيتام والأسر والمساعدات والمتابعات نهائياً من قاعدة البيانات. لن يُحذف سجل النشاط وسجل المستخدمين. لا يمكن التراجع عن هذا الإجراء.</p>
                    </div>
                    <button class="btn btn-danger" onclick="confirmClearAll()">
                        🗑️ حذف جميع بيانات السجلات
                    </button>
                </div>
            </div>""", 'backup page')

# ---------------------------------------------------------------- 13. reports perm note
rep("""                    <div class="stats-grid">
                        <div class="stat-card" onclick="generateReport('orphan')" style="cursor: pointer;">""",
    """                    <div class="inline-note hidden" id="reportsPermNote">
                        التقارير والتصدير متاحة لمستخدمي صلاحية «موظف» و«مدير» فقط.
                    </div>
                    <div class="stats-grid" id="reportsCards">
                        <div class="stat-card" onclick="generateReport('orphan')" style="cursor: pointer;">""", 'reports perm')

# ---------------------------------------------------------------- 14. new modals before QR modal
NEW_MODALS = """            <!-- Family Form Modal -->
    <div id="familyModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="familyModalTitle">إضافة أسرة</h3>
                <button class="modal-close" onclick="closeFamilyModal()">×</button>
            </div>
            <div class="modal-body">
                <form id="familyForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>اسم الأسرة *</label>
                            <input type="text" id="fam_name" required>
                        </div>
                        <div class="form-group">
                            <label>رمز الأسرة</label>
                            <input type="text" id="fam_code" dir="ltr" placeholder="يُنشأ تلقائياً إذا تُرك فارغاً">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>اسم ولي الأمر</label>
                            <input type="text" id="fam_guardian">
                        </div>
                        <div class="form-group">
                            <label>رقم الجوال</label>
                            <input type="tel" id="fam_phone" dir="ltr" placeholder="05XXXXXXXX">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>المنطقة / المحافظة</label>
                            <input type="text" id="fam_district">
                        </div>
                        <div class="form-group">
                            <label>العنوان</label>
                            <input type="text" id="fam_address">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>حالة السكن</label>
                            <select id="fam_housing">
                                <option value="">اختر الحالة</option>
                                <option value="house">منزل</option>
                                <option value="rental">مستأجر</option>
                                <option value="relatives">سكن أقارب</option>
                                <option value="tent">خيمة</option>
                                <option value="shelter">مركز إيواء</option>
                                <option value="other">أخرى</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>مصدر الدخل</label>
                            <input type="text" id="fam_income">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>عدد أفراد الأسرة</label>
                            <input type="number" id="fam_members" min="1">
                        </div>
                        <div class="form-group">
                            <label>الحالة الاقتصادية</label>
                            <select id="fam_economic">
                                <option value="">اختر الحالة</option>
                                <option value="good">جيدة</option>
                                <option value="medium">متوسطة</option>
                                <option value="poor">ضعيفة</option>
                                <option value="verypoor">ضعيفة جداً</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>النزوح</label>
                            <select id="fam_displaced">
                                <option value="no">غير نازحة</option>
                                <option value="yes">نازحة</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>ملاحظات</label>
                            <textarea id="fam_notes" rows="3"></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFamilyModal()">إلغاء</button>
                        <button type="submit" class="btn btn-success">حفظ الأسرة ✓</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- View Orphan Modal -->
    <div id="orphanViewModal" class="modal">
        <div class="modal-content print-area">
            <div class="modal-header">
                <h3 class="modal-title" id="orphanViewTitle">بيانات اليتيم</h3>
                <button class="modal-close" onclick="closeViewOrphanModal()">×</button>
            </div>
            <div class="modal-body" id="orphanViewContent"></div>
            <div class="modal-footer no-print">
                <button class="btn btn-secondary" onclick="printOrphanView()">🖨️ طباعة</button>
                <button class="btn btn-info" onclick="pdfOrphanView()">📄 PDF</button>
                <button class="btn btn-info" onclick="showQRFromView()">QR</button>
                <button class="btn btn-primary perm-edit" onclick="editFromView()">تعديل</button>
            </div>
        </div>
    </div>

    <!-- View Family Modal -->
    <div id="familyViewModal" class="modal">
        <div class="modal-content print-area">
            <div class="modal-header">
                <h3 class="modal-title" id="familyViewTitle">بيانات الأسرة</h3>
                <button class="modal-close" onclick="closeViewFamilyModal()">×</button>
            </div>
            <div class="modal-body" id="familyViewContent"></div>
            <div class="modal-footer no-print">
                <button class="btn btn-secondary" onclick="printFamilyView()">🖨️ طباعة</button>
                <button class="btn btn-info" onclick="showFamilyQRFromView()">QR</button>
                <button class="btn btn-primary perm-edit" onclick="editFamilyFromView()">تعديل</button>
            </div>
        </div>
    </div>

    <!-- Assistance Form Modal -->
    <div id="assistanceModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="assistanceModalTitle">إضافة مساعدة</h3>
                <button class="modal-close" onclick="closeAssistanceModal()">×</button>
            </div>
            <div class="modal-body">
                <form id="assistanceForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>اليتيم *</label>
                            <input type="text" id="as_orphan" list="orphanDatalist" required placeholder="ابحث بالاسم أو رقم الملف...">
                            <datalist id="orphanDatalist"></datalist>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>التاريخ *</label>
                            <input type="date" id="as_date" required>
                        </div>
                        <div class="form-group">
                            <label>النوع *</label>
                            <select id="as_type" required>
                                <option value="">اختر النوع</option>
                                <option value="material">عينية</option>
                                <option value="food">غذائية</option>
                                <option value="cash">مالية</option>
                                <option value="medical">طبية</option>
                                <option value="education">تعليمية</option>
                                <option value="housing">سكنية</option>
                                <option value="other">أخرى</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>المبلغ (إن وجد)</label>
                            <input type="number" id="as_amount" min="0" step="0.01">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>ملاحظات</label>
                            <textarea id="as_notes" rows="2"></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeAssistanceModal()">إلغاء</button>
                        <button type="submit" class="btn btn-success">حفظ ✓</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Follow-up Form Modal -->
    <div id="followupModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="followupModalTitle">إضافة متابعة</h3>
                <button class="modal-close" onclick="closeFollowupModal()">×</button>
            </div>
            <div class="modal-body">
                <form id="followupForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>اليتيم *</label>
                            <input type="text" id="fu_orphan" list="orphanDatalist" required placeholder="ابحث بالاسم أو رقم الملف...">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>تاريخ المتابعة *</label>
                            <input type="date" id="fu_date" required>
                        </div>
                        <div class="form-group">
                            <label>تاريخ المتابعة القادمة</label>
                            <input type="date" id="fu_next_date">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>الملاحظات *</label>
                            <textarea id="fu_notes" rows="3" required></textarea>
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeFollowupModal()">إلغاء</button>
                        <button type="submit" class="btn btn-success">حفظ ✓</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- User Form Modal (Admin) -->
    <div id="userModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">إضافة مستخدم</h3>
                <button class="modal-close" onclick="closeUserModal()">×</button>
            </div>
            <div class="modal-body">
                <form id="userForm">
                    <div id="userModalAlert" class="alert alert-error"></div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>الاسم الكامل *</label>
                            <input type="text" id="u_full_name" required>
                        </div>
                        <div class="form-group">
                            <label>اسم المستخدم</label>
                            <input type="text" id="u_username">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>البريد الإلكتروني *</label>
                            <input type="email" id="u_email" required dir="ltr">
                        </div>
                        <div class="form-group">
                            <label>الدور *</label>
                            <select id="u_role" required>
                                <option value="staff">موظف — إضافة وتعديل بدون حذف</option>
                                <option value="viewer">مشاهد — قراءة فقط</option>
                                <option value="admin">مدير — كل الصلاحيات</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>كلمة المرور المؤقتة</label>
                            <input type="text" id="u_password" dir="ltr" placeholder="اتركها فارغة لتوليد كلمة مرور عشوائية" minlength="6">
                        </div>
                    </div>
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="closeUserModal()">إلغاء</button>
                        <button type="submit" class="btn btn-success">إنشاء المستخدم ✓</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- Generic Confirm Modal -->
    <div id="confirmModal" class="modal">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h3 class="modal-title" id="confirmTitle">تأكيد</h3>
                <button class="modal-close" onclick="cancelConfirm()">×</button>
            </div>
            <div class="modal-body">
                <p id="confirmMessage"></p>
                <div class="form-group hidden" id="confirmInputGroup">
                    <label id="confirmInputLabel"></label>
                    <input type="text" id="confirmInput" autocomplete="off">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="cancelConfirm()">إلغاء</button>
                <button class="btn btn-danger" id="confirmOkBtn">تأكيد</button>
            </div>
        </div>
    </div>

    <!-- Orphan Picker Modal (Reports) -->
    <div id="pickOrphanModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title" id="pickOrphanTitle">اختر يتيماً</h3>
                <button class="modal-close" onclick="closePickOrphan()">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <input type="text" id="pickOrphanSearch" placeholder="اكتب الاسم أو رقم الملف ثم اختر من القائمة..." oninput="searchPickOrphan()">
                </div>
                <div id="pickOrphanResults"></div>
            </div>
        </div>
    </div>

    <!-- Family Picker Modal (Reports) -->
    <div id="pickFamilyModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">اختر أسرة</h3>
                <button class="modal-close" onclick="closePickFamily()">×</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <input type="text" id="pickFamilySearch" placeholder="اكتب اسم الأسرة ثم اختر من القائمة..." oninput="searchPickFamily()">
                </div>
                <div id="pickFamilyResults"></div>
            </div>
        </div>
    </div>

    <!-- QR Modal -->"""
rep('    <!-- QR Modal -->', NEW_MODALS, 'new modals')

# ---------------------------------------------------------------- 15. qr print area
rep("""    <div id="qrModal" class="modal">
        <div class="modal-content">""",
    """    <div id="qrModal" class="modal">
        <div class="modal-content print-area">""", 'qr print area')

# ---------------------------------------------------------------- 16. remove old script -> module
start = html.index('    <script>\n        // Database initialization')
end_marker = '    </script>\n</body>'
end = html.index(end_marker) + len('    </script>\n')
html = html[:start] + '    <script type="module" src="/src/main.js"></script>\n' + html[end:]
count_replacements += 1

open(DST, 'w', encoding='utf-8').write(html)
print(f"OK — {count_replacements} transformations applied -> {DST}")
print(f"size: {len(html)} bytes, lines: {html.count(chr(10))+1}")
