const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwk8dwV-Q9kdFRXGiUf3CBvnhhTh8_Y1rmDf9ve41JawKoNmC17s-7pZ4oAPnGe7mgI/exec";

let currentUser = null;
const ADMIN_EMAILS = ['coep.paper.archive@gmail.com'];

let currentPage = 1;
const ITEMS_PER_PAGE = 20;

window.handleCredentialResponse = async (response) => {
    const base64Url = response.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    const payload = JSON.parse(jsonPayload);

    currentUser = {
        name: payload.name,
        email: payload.email,
        picture: payload.picture,
        token: response.credential
    };

    document.querySelector('.g_id_signin').style.display = 'none';
    document.getElementById('userProfile').style.display = 'flex';
    document.getElementById('userAvatar').src = currentUser.picture;

    if (ADMIN_EMAILS.includes(currentUser.email)) {
        document.getElementById('adminBtn').style.display = 'block';
    }

    await syncBookmarksFromServer();
    showToast(`Welcome back, ${currentUser.name}!`);
};

window.signOut = () => {
    currentUser = null;
    document.getElementById('userProfile').style.display = 'none';
    document.getElementById('adminBtn').style.display = 'none';
    document.querySelector('.g_id_signin').style.display = 'block';
    if (window.google && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    showToast('You have been signed out.');
};

function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
}
function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function getPending() { return lsGet('coep_pending', []); }
function savePending(arr) { lsSet('coep_pending', arr); }
function getApproved() { return lsGet('coep_approved', []); }
function saveApproved(arr) { lsSet('coep_approved', arr); }

let allPapers = [...getApproved()];

function escAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

async function fetchLivePapers() {
    showLoadingSkeletons();
    try {
        const response = await fetch(WEB_APP_URL);
        if (!response.ok) throw new Error('Network response was not ok');
        const liveData = await response.json();

        const communityPapers = liveData.map(item => ({
            id: generateStableId(item),
            subject: item.Subject,
            year: item.Year,
            sem: item.Semester,
            examType: item.ExamType,
            examYear: item.ExamYear,
            creatorName: item.Name,
            creatorEmail: item.CreatorEmail,
            link: item.FileLink,
            date: item.Timestamp,
            branch: item.Branch || (item.Year === 'FY' ? 'Common' : 'Common'),
            docType: item.DocType || 'paper',
            noteTopic: item.NoteTopic || '',
            noteAuthor: item.NoteAuthor || ''
        })).reverse();

        allPapers = [...getApproved(), ...communityPapers];

        updateSubjectDatalist();
        window.updateFilters();
        updateStats();
        renderCarousel();

        window.switchTab(currentTab);

    } catch (error) {
        console.error(error);
        showFetchError();
    }
}

fetchLivePapers();

function generateStableId(item) {
    const raw = [item.Subject, item.Year, item.Semester, item.ExamType, item.ExamYear, item.Name, item.DocType].join('|');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const chr = raw.charCodeAt(i);
        hash = ((hash << 5) - hash) + chr;
        hash |= 0;
    }
    return 'live_' + Math.abs(hash).toString(36);
}

function showLoadingSkeletons() {
    const container = document.getElementById('itemsContainer');
    if (!container) return;
    container.innerHTML = Array.from({ length: 6 }).map(() => `
        <div class="card skeleton-card">
            <div class="card-header">
                <div class="skeleton-line" style="width:70%; height:18px; margin-bottom:10px;"></div>
                <div style="display:flex;gap:6px;">
                    <div class="skeleton-line" style="width:70px; height:22px;"></div>
                    <div class="skeleton-line" style="width:50px; height:22px;"></div>
                </div>
            </div>
            <div class="card-body">
                <div class="skeleton-line" style="width:90%; height:14px; margin-bottom:8px;"></div>
                <div class="skeleton-line" style="width:60%; height:14px;"></div>
            </div>
            <div class="card-footer">
                <div class="skeleton-line" style="flex:1; height:36px;"></div>
                <div class="skeleton-line" style="flex:1; height:36px;"></div>
            </div>
        </div>
    `).join('');
}

function showFetchError() {
    const container = document.getElementById('itemsContainer');
    if (!container) return;
    container.innerHTML = `
        <div style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted);">
            <p style="font-size:1.5rem; margin-bottom:8px;">⚠️</p>
            <p style="font-size:1.05rem; font-weight:600; margin-bottom:4px;">Could not load documents</p>
            <p style="font-size:0.9rem;">Please check your connection and <button onclick="fetchLivePapers()" style="background:none;border:none;color:var(--primary);font-weight:600;cursor:pointer;font-size:0.9rem;text-decoration:underline;">try again</button>.</p>
        </div>`;
}

function updateSubjectDatalist() {
    const dl = document.getElementById('subjectList');
    if (!dl) return;
    const uniqueSubjects = [...new Set(allPapers.map(p => p.subject))].sort();
    dl.innerHTML = uniqueSubjects.map(s => `<option value="${escAttr(s)}"></option>`).join('');
}

function applyDarkMode(on) {
    document.body.classList.toggle('dark', on);
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.textContent = on ? 'Light' : 'Dark';
}

window.toggleDarkMode = () => {
    const isDark = !document.body.classList.contains('dark');
    lsSet('coep_dark', isDark);
    applyDarkMode(isDark);
};

window.toggleMobileMenu = () => {
    const nav = document.getElementById('navActions');
    nav.classList.toggle('show-menu');
};

function showToast(msg, duration = 3000) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), duration);
}

function updateStats() {
    const validPapers = allPapers.filter(p => p.link);
    const subjects = new Set(validPapers.map(p => p.subject)).size;
    const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
    el('statPapers', validPapers.length);
    el('statSubjects', subjects);
}

function renderCarousel() {
    const track = document.getElementById('carouselTrack');
    if (!track) return;

    const recent = [...allPapers]
        .filter(p => p.link && p.docType === 'paper')
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 12);

    track.innerHTML = '';

    if (recent.length === 0) {
        track.innerHTML = '<div style="color: var(--text-muted); font-size: 0.9rem; padding: 10px;">Repository initializing. No documents available yet.</div>';
        return;
    }

    recent.forEach(p => {
        const examClass = p.examType === 'MSE' ? 'tag-mse' : 'tag-ese';
        const card = document.createElement('div');
        card.className = 'carousel-card';
        card.innerHTML = `
            <div class="cc-subject" title="${escAttr(p.subject)}">${escAttr(p.subject)}</div>
            <div class="cc-meta">
                <span class="cc-tag ${examClass}" style="color:white;">${escAttr(p.examType)}</span>
                <span class="cc-tag tag-sem">${escAttr(p.year)} · ${escAttr(p.sem)}</span>
                ${p.branch && p.branch !== 'Common' ? `<span class="cc-tag tag-sem">${escAttr(p.branch)}</span>` : ''}
                <span style="font-size:0.76rem;">${escAttr(String(p.examYear))}</span>
            </div>
        `;
        card.addEventListener('click', () => {
            if (p.link) window.openPdfPreview(p.subject, p.link);
        });
        track.appendChild(card);
    });

    initCarouselSwipe(track);
}

function initCarouselSwipe(track) {
    const wrapper = track.parentElement;
    let startX = 0;
    let scrollStart = 0;
    let isDragging = false;

    wrapper.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        scrollStart = wrapper.scrollLeft;
        isDragging = true;
    }, { passive: true });

    wrapper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const dx = startX - e.touches[0].clientX;
        wrapper.scrollLeft = scrollStart + dx;
    }, { passive: true });

    wrapper.addEventListener('touchend', () => { isDragging = false; });
}

function getDriveEmbedUrl(link) {
    let fileId = null;
    const patterns = [/\/file\/d\/([^/]+)/, /id=([^&]+)/, /open\?id=([^&]+)/];
    for (const pat of patterns) {
        const m = link.match(pat);
        if (m) { fileId = m[1]; break; }
    }
    return fileId ? `https://drive.google.com/file/d/${fileId}/preview` : link;
}

let currentPdfLink = '';

window.openPdfPreview = function(title, link) {
    currentPdfLink = link;
    document.getElementById('pdfPreviewTitle').textContent = title;
    document.getElementById('pdfPreviewFrame').src = getDriveEmbedUrl(link);
    document.getElementById('pdfOpenLink').href = link;
    document.getElementById('copyLinkBtn').textContent = 'Copy Link';
    document.getElementById('pdfPreviewModal').classList.add('open');
};

window.closePdfModal = () => {
    document.getElementById('pdfPreviewModal').classList.remove('open');
    document.getElementById('pdfPreviewFrame').src = '';
    currentPdfLink = '';
};

window.copyPdfLink = () => {
    if (!currentPdfLink) return;
    navigator.clipboard.writeText(currentPdfLink).then(() => {
        const btn = document.getElementById('copyLinkBtn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy Link'; }, 2000);
    }).catch(() => {
        showToast('Could not copy link. Please copy it manually.');
    });
};

function getBookmarks() { return lsGet('coep_bookmarks', []); }
function _saveBookmarksLocal(bm) { lsSet('coep_bookmarks', bm); }

async function _pushBookmarksToServer(bm) {
    if (!currentUser) return;
    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'saveBookmarks', email: currentUser.email, token: currentUser.token, bookmarks: bm })
        });
    } catch {}
}

async function syncBookmarksFromServer() {
    if (!currentUser) return;
    try {
        const url = `${WEB_APP_URL}?action=getBookmarks&email=${encodeURIComponent(currentUser.email)}&token=${encodeURIComponent(currentUser.token)}`;
        const res = await fetch(url);
        const data = await res.json();
        const serverBm = Array.isArray(data.bookmarks) ? data.bookmarks : [];
        const localBm = getBookmarks();
        const merged = [...new Set([...serverBm, ...localBm])];
        _saveBookmarksLocal(merged);

        if (merged.length > serverBm.length) await _pushBookmarksToServer(merged);

        updateBookmarkBadge();
        if (currentTab === 'saved') renderSavedSection();
        _refreshAllBookmarkButtons(merged);
    } catch {}
}

function isBookmarked(id) { return getBookmarks().includes(id); }

window.toggleBookmark = async function(id) {
    let bm = getBookmarks();
    const adding = !bm.includes(id);
    if (adding) {
        bm.push(id);
        showToast('Document added to saved items.');
    } else {
        bm = bm.filter(x => x !== id);
        showToast('Document removed from saved items.');
    }

    _saveBookmarksLocal(bm);
    updateBookmarkBadge();
    _refreshAllBookmarkButtons(bm);
    await _pushBookmarksToServer(bm);
};

function _refreshAllBookmarkButtons(bm) {
    document.querySelectorAll('.bm-btn[data-id]').forEach(btn => {
        const id = btn.dataset.id;
        const marked = bm.includes(id);
        btn.classList.toggle('bookmarked', marked);
        btn.title = marked ? 'Remove bookmark' : 'Save for later';
        btn.textContent = marked ? '★' : '☆';
    });
}

function updateBookmarkBadge() {
    const bm = getBookmarks();
    const badge = document.getElementById('bookmarkCount');
    if (!badge) return;
    badge.style.display = bm.length ? 'inline' : 'none';
    badge.textContent = bm.length;
}

window.showBookmarks = () => window.switchTab('saved');

let reportingPaper = null;

window.openReportModal = (paper) => {
    reportingPaper = paper;
    document.getElementById('reportPaperName').textContent = paper.subject;
    document.getElementById('reportDetails').value = '';
    document.getElementById('reportModal').classList.add('open');
};

window.closeReportModal = () => {
    document.getElementById('reportModal').classList.remove('open');
};

window.submitReport = async () => {
    const type = document.getElementById('reportType').value;
    const details = document.getElementById('reportDetails').value;
    const reportPayload = {
        action: 'report',
        paperId: reportingPaper?.id,
        subject: reportingPaper?.subject,
        link: reportingPaper?.link,
        type,
        details,
        reporterEmail: currentUser?.email || 'anonymous',
        timestamp: new Date().toISOString()
    };

    window.closeReportModal();
    showToast('Submitting report...');

    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(reportPayload)
        });
        showToast('Report submitted. The administrative team will review it.');
    } catch {
        const reports = lsGet('coep_reports', []);
        reports.push(reportPayload);
        lsSet('coep_reports', reports);
        showToast('Report saved locally (network unavailable).');
    }
};

let selectedFile = null;

window.toggleDocTypeFields = () => {
    const docType = document.getElementById('uploadDocType')?.value || 'paper';
    const examFields = document.getElementById('examSpecificFields');
    const noteFields = document.getElementById('notesSpecificFields');
    const semSelect = document.getElementById('uploadSem');
    const academicGrid = document.getElementById('academicGrid');
    const academicLabel = document.getElementById('academicLabel');
    const subjectInput = document.getElementById('uploadSubject');
    const subjectLabel = document.getElementById('subjectLabel');

    if (examFields) examFields.style.display = (docType === 'paper') ? 'block' : 'none';
    if (noteFields) noteFields.style.display = (docType === 'notes') ? 'block' : 'none';

    if (docType === 'syllabus') {
        if (semSelect) semSelect.style.display = 'none';
        if (academicGrid) academicGrid.style.gridTemplateColumns = '1fr';
        if (academicLabel) academicLabel.textContent = 'Academic Year';
        if (subjectLabel) subjectLabel.textContent = 'Syllabus Title *';
        if (subjectInput) {
            subjectInput.removeAttribute('list');
            subjectInput.placeholder = 'e.g., Complete Computer Engineering Syllabus 2024';
        }
    } else {
        if (semSelect) semSelect.style.display = 'block';
        if (academicGrid) academicGrid.style.gridTemplateColumns = '1fr 1fr';
        if (academicLabel) academicLabel.innerHTML = 'Academic Year &amp; Semester';
        if (subjectLabel) subjectLabel.textContent = 'Subject Title *';
        if (subjectInput) {
            subjectInput.setAttribute('list', 'subjectList');
            subjectInput.placeholder = 'e.g., Engineering Physics (EP)';
        }
    }

    window.toggleUploadBranch();
};

window.openUploadModal = () => {
    document.getElementById('navActions').classList.remove('show-menu');
    const nameField = document.getElementById('anonymousNameField');
    if (nameField) {
        nameField.style.display = currentUser ? 'none' : 'block';
    }
    document.getElementById('uploadModal').classList.add('open');
};

window.closeUploadModal = () => {
    document.getElementById('uploadModal').classList.remove('open');
    resetUploadForm();
};

window.handleDrop = (e) => {
    e.preventDefault();
    document.getElementById('dropzone').classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
};

window.handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
};

function processFile(file) {
    const status = document.getElementById('fileStatus');
    if (file.type !== 'application/pdf') {
        status.className = 'file-status error';
        status.textContent = 'Invalid file format. Please upload a PDF file.';
        selectedFile = null;
        return;
    }
    if (file.size > 20 * 1024 * 1024) {
        status.className = 'file-status error';
        status.textContent = 'File exceeds maximum allowed size (20MB).';
        selectedFile = null;
        return;
    }
    selectedFile = file;
    status.className = 'file-status success';
    status.textContent = `Attached: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    document.getElementById('dropzone').querySelector('.dropzone-text').textContent = file.name;
}

function resetUploadForm() {
    selectedFile = null;
    const ids = ['uploadSubject', 'uploadExamYear', 'uploadNoteTopic', 'uploadNoteAuthor', 'uploadUploaderName'];
    ids.forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });

    const docType = document.getElementById('uploadDocType');
    if (docType) docType.value = 'paper';
    window.toggleDocTypeFields();

    const status = document.getElementById('fileStatus');
    if (status) { status.textContent = ''; status.className = 'file-status'; }
    const dz = document.getElementById('dropzone');
    if (dz) dz.querySelector('.dropzone-text').textContent = 'Drag and drop a PDF file, or click to browse';
    const dupWarn = document.getElementById('duplicateWarning');
    if (dupWarn) dupWarn.style.display = 'none';

    const progressWrap = document.getElementById('uploadProgressWrap');
    if (progressWrap) progressWrap.style.display = 'none';
    setUploadProgress(0);
}

function setUploadProgress(pct) {
    const fill = document.getElementById('uploadProgressFill');
    const label = document.getElementById('uploadProgressPct');
    if (fill) fill.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
}

function checkForDuplicate(subject, year, sem, docType, examType, examYear) {
    const normalise = s => String(s || '').trim().toLowerCase();
    return allPapers.some(p =>
        normalise(p.subject) === normalise(subject) &&
        normalise(p.year) === normalise(year) &&
        normalise(p.sem) === normalise(sem) &&
        normalise(p.docType || 'paper') === normalise(docType) &&
        (docType !== 'paper' || (normalise(p.examType) === normalise(examType) && normalise(p.examYear) === normalise(examYear)))
    );
}

window.submitUpload = () => {
    let finalCreatorName = 'Anonymous';
    if (currentUser) {
        finalCreatorName = currentUser.name;
    } else {
        finalCreatorName = document.getElementById('uploadUploaderName').value.trim();
        if (!finalCreatorName) {
            showToast('Please provide your name to submit a document.');
            return;
        }
    }

    const docType = document.getElementById('uploadDocType')?.value || 'paper';
    const subject = document.getElementById('uploadSubject').value.trim();
    const year = document.getElementById('uploadYear').value;
    const sem = docType === 'syllabus' ? '---' : document.getElementById('uploadSem').value;
    const branchValue = year === 'FY' ? 'Common' : document.getElementById('uploadBranch')?.value || 'Common';

    if (!subject) { showToast('Title is required.'); return; }

    let examType = '---';
    let examYear = '---';
    let noteTopic = '';
    let noteAuthor = '';

    if (docType === 'paper') {
        examType = document.getElementById('uploadExamType').value;
        const rawYear = document.getElementById('uploadExamYear').value.trim();
        if (rawYear && !/^\d{4}$/.test(rawYear)) {
            showToast('Examination Year must be a 4-digit number (e.g. 2024).');
            return;
        }
        examYear = rawYear || new Date().getFullYear().toString();
    } else if (docType === 'notes') {
        noteTopic = document.getElementById('uploadNoteTopic').value.trim();
        noteAuthor = document.getElementById('uploadNoteAuthor').value.trim();
    }

    if (!selectedFile) { showToast('Please select a PDF file to upload.'); return; }

    if (checkForDuplicate(subject, year, sem, docType, examType, examYear)) {
        const dupWarn = document.getElementById('duplicateWarning');
        if (dupWarn) dupWarn.style.display = 'block';
        showToast('A document with these details already exists in the archive.');
        return;
    }

    const progressWrap = document.getElementById('uploadProgressWrap');
    if (progressWrap) progressWrap.style.display = 'block';
    setUploadProgress(10);

    const submitBtn = document.querySelector('#uploadModal .btn-primary');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';

    const payload = {
        action: 'submit',
        token: currentUser ? currentUser.token : null,
        creatorName: finalCreatorName,
        docType, subject, year, sem, examType, examYear, branch: branchValue,
        noteTopic, noteAuthor,
        link: "",
        fileName: selectedFile.name,
        mimeType: selectedFile.type
    };

    const reader = new FileReader();
    reader.onload = function(e) {
        setUploadProgress(40);
        payload.fileData = e.target.result.split(',')[1];
        sendToBackend(payload);
    };
    reader.readAsDataURL(selectedFile);
};

function sendToBackend(payload) {
    setUploadProgress(60);
    fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    })
    .then(response => {
        setUploadProgress(85);
        return response.json();
    })
    .then(result => {
        setUploadProgress(100);
        const submitBtn = document.querySelector('#uploadModal .btn-primary');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }

        if (result.status === 'success') {
            const submission = {
                id: 'sub_' + Date.now(),
                ...payload,
                creatorName: payload.creatorName,
                link: result.link,
                date: new Date().toISOString(),
                status: 'pending'
            };
            delete submission.fileData;
            delete submission.token;

            const pending = getPending();
            pending.unshift(submission);
            savePending(pending);

            window.closeUploadModal();
            showToast('Submission successful. The document is pending administrator review.');
        } else {
            const progressWrap = document.getElementById('uploadProgressWrap');
            if (progressWrap) progressWrap.style.display = 'none';
            showToast('Submission failed: ' + result.message);
        }
    })
    .catch(err => {
        console.error(err);
        const submitBtn = document.querySelector('#uploadModal .btn-primary');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Submit'; }
        const progressWrap = document.getElementById('uploadProgressWrap');
        if (progressWrap) progressWrap.style.display = 'none';
        showToast('Network error encountered. Please check your connection and try again.');
    });
}

window.openAdminPanel = () => {
    document.getElementById('navActions').classList.remove('show-menu');
    if (!currentUser || !ADMIN_EMAILS.includes(currentUser.email)) {
        showToast("Unauthorized access.");
        return;
    }
    renderAdminPanel();
    document.getElementById('adminModal').classList.add('open');
};

window.closeAdminModal = () => {
    document.getElementById('adminModal').classList.remove('open');
};

function renderAdminPanel() {
    const container = document.getElementById('adminPanelContent');
    const pending = getPending();
    const reports = lsGet('coep_reports', []);

    if (!pending.length && !reports.length) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:2rem;">System status: Operational. No pending actions.</p>';
        return;
    }

    let html = '';

    if (pending.length) {
        html += `<h4 style="margin-bottom:1rem; color:var(--text);">Pending Submissions (${pending.length})</h4>`;
        pending.forEach(sub => {
            const typeLabel = sub.docType === 'notes' ? 'Class Notes' : (sub.docType === 'syllabus' ? 'Syllabus' : 'Exam Paper');

            let metaString = `${escAttr(sub.year)}`;
            if (sub.sem !== '---') metaString += ` · ${escAttr(sub.sem)}`;
            if (sub.docType === 'paper') metaString += ` · ${escAttr(sub.examType)} · ${escAttr(String(sub.examYear))}`;

            html += `
            <div class="admin-submission" id="sub_${escAttr(sub.id)}">
                <div style="display:flex; justify-content:space-between; align-items:start;">
                    <h4>${escAttr(sub.subject)}</h4>
                    <span class="tag" style="background:var(--surface); border:1px solid var(--border-color);">${typeLabel}</span>
                </div>
                <p>Submitted by: <strong>${escAttr(sub.creatorName)}</strong></p>
                <p>${metaString}</p>
                <p>Branch: <strong>${escAttr(sub.branch || 'Common')}</strong></p>
                <p>Link: <a href="${escAttr(sub.link)}" target="_blank" style="color:var(--primary); word-break:break-all;">${escAttr(sub.link)}</a></p>
                <p style="font-size:0.8rem;">${new Date(sub.date).toLocaleString('en-IN')}</p>
                <div class="admin-actions">
                    <button class="btn-approve" onclick="window.adminApprove('${escAttr(sub.id)}')">Approve</button>
                    <button class="btn-reject" onclick="window.adminReject('${escAttr(sub.id)}')">Reject</button>
                </div>
            </div>`;
        });
    }

    if (reports.length) {
        html += `<h4 style="margin:1.5rem 0 1rem; color:var(--text);">Local Reports (${reports.length})</h4>`;
        reports.forEach((r, i) => {
            html += `
            <div class="admin-submission">
                <h4>${escAttr(r.subject || 'Unknown')}</h4>
                <p>Classification: <strong>${escAttr(r.type)}</strong></p>
                <p>${escAttr(r.details || 'No additional details provided.')}</p>
                <p><a href="${escAttr(r.link || '')}" target="_blank" style="color:var(--primary); word-break:break-all;">${escAttr(r.link || '')}</a></p>
                <p style="font-size:0.8rem;">${new Date(r.timestamp).toLocaleString('en-IN')}</p>
                <div class="admin-actions">
                    <button class="btn-reject" onclick="window.adminDismissReport(${i})">Dismiss</button>
                </div>
            </div>`;
        });
    }

    container.innerHTML = html;
}

window.adminApprove = async (id) => {
    const pending = getPending();
    const sub = pending.find(s => s.id === id);
    if (!sub) return;

    showToast('Approving document...');

    try {
        const response = await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'adminApprove',
                token: currentUser.token,
                link: sub.link
            })
        });

        const result = await response.json();
        if (result.status === 'success') {
            const approved = getApproved();
            approved.unshift({ ...sub, status: 'approved' });
            saveApproved(approved);
            savePending(pending.filter(s => s.id !== id));

            allPapers = [...getApproved()];
            fetchLivePapers();
            renderAdminPanel();
            showToast('Document securely approved and published.');
        } else {
            showToast('Authorization failed: ' + result.message);
        }
    } catch (e) {
        showToast('Network error processing approval.');
    }
};

window.adminReject = async (id) => {
    const pending = getPending();
    const sub = pending.find(s => s.id === id);
    if (!sub) return;

    showToast('Rejecting document...');

    try {
        await fetch(WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'adminReject',
                token: currentUser.token,
                link: sub.link
            })
        });

        savePending(pending.filter(s => s.id !== id));
        renderAdminPanel();
        showToast('Submission securely rejected.');
    } catch (e) {
        showToast('Network error processing rejection.');
    }
};

window.adminDismissReport = (index) => {
    const reports = lsGet('coep_reports', []);
    reports.splice(index, 1);
    lsSet('coep_reports', reports);
    renderAdminPanel();
    showToast('Report dismissed successfully.');
};

window.triggerFilter = (resetPage = true) => {
    if (currentTab === 'papers') window.renderPapers(resetPage);
    else if (currentTab === 'notes') renderNotes();
    else if (currentTab === 'saved') renderSavedSection();
};

function renderLeaderboard() {
    const container = document.getElementById('leaderboardContainer');
    if (!container) return;

    const counts = {};

    allPapers.filter(p => p.link && !ADMIN_EMAILS.includes((p.creatorEmail || '').toLowerCase())).forEach(p => {
        if (p.creatorName !== 'System Admin' && p.creatorName !== 'Admin') {
            counts[p.creatorName] = (counts[p.creatorName] || 0) + 1;
        }
    });

    getPending().forEach(s => {
        if (!ADMIN_EMAILS.includes((s.creatorEmail || '').toLowerCase())) {
            if (s.creatorName !== 'System Admin' && s.creatorName !== 'Admin') {
                counts[s.creatorName] = (counts[s.creatorName] || 0) + 1;
            }
        }
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (!sorted.length) {
        container.innerHTML = `
            <div class="leaderboard-header"><h2>Top Contributors</h2><p>Recognition for repository contributors</p></div>
            <div class="leaderboard-list" style="padding:2rem; text-align:center; color:var(--text-muted);">
                <p>No community contributions recorded yet.</p>
                <p style="margin-top:8px;">Submit a document to be recognized on the leaderboard.</p>
            </div>`;
        return;
    }

    const rankClasses = ['gold', 'silver', 'bronze'];
    const badges = ['Scholar', 'Contributor', 'Participant', 'Member'];

    let rows = sorted.map(([name, count], i) => {
        const rank = i < 3 ? `<span class="lb-rank ${rankClasses[i]}">#${i + 1}</span>` : `<span class="lb-rank">#${i + 1}</span>`;
        const badge = i < 4 ? `<span class="lb-badge">${badges[i]}</span>` : '';
        return `<div class="leaderboard-row">${rank}<span class="lb-name">${escAttr(name)}</span>${badge}<span class="lb-count">${count} document${count !== 1 ? 's' : ''}</span></div>`;
    }).join('');

    container.innerHTML = `
        <div class="leaderboard-header">
            <h2>Top Contributors</h2>
            <p>Recognition for repository contributors</p>
        </div>
        <div class="leaderboard-list">${rows}</div>`;
}

function renderNotes() {
    const container = document.getElementById('notesContainer');
    if (!container) return;

    const year = document.getElementById('filterYear').value;
    const sem = document.getElementById('filterSem').value;
    const branch = document.getElementById('filterBranch').value;
    const searchInputEl = document.getElementById('searchInput');
    const search = searchInputEl ? searchInputEl.value.toLowerCase() : '';

    const notes = allPapers.filter(p => {
        if (p.docType !== 'notes' && p.docType !== 'syllabus') return false;
        if (year !== 'all' && p.year !== year) return false;
        if (sem !== 'all' && p.sem !== sem && p.sem !== '---') return false;
        if (branch !== 'all') {
            if (p.year !== 'FY' && p.branch !== branch && p.branch !== 'Common') return false;
        }
        if (search && !p.subject.toLowerCase().includes(search)) return false;
        return true;
    });

    notes.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (!notes.length) {
        container.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:4rem; grid-column:1/-1;">No supplemental documents found matching criteria.</p>';
        return;
    }

    container.innerHTML = notes.map(n => {
        const typeLabel = n.docType === 'notes' ? 'Notes' : 'Syllabus';
        const titleText = `${escAttr(n.subject)}${n.noteTopic ? ` - ${escAttr(n.noteTopic)}` : ''}`;
        const authorText = n.noteAuthor ? ` (${escAttr(n.noteAuthor)})` : '';
        const semText = n.sem === '---' ? '' : ` · ${escAttr(n.sem)}`;

        return `
        <div class="note-card">
            <div class="note-card-type note-type-${escAttr(n.docType)}">${typeLabel}</div>
            <div class="note-card-title">${titleText}</div>
            <div class="note-card-meta">Date: ${new Date(n.date).toLocaleDateString('en-IN')} &nbsp;|&nbsp; Source: ${escAttr(n.creatorName)}${authorText}</div>
            <div style="display:flex; gap:8px; margin-top:auto;">
                <button onclick="window.openPdfPreview('${escAttr(n.subject.replace(/'/g, "\\'"))}', '${escAttr(n.link)}')" class="btn btn-outline" style="flex:1; font-size:0.88rem; padding:8px;">Preview</button>
                <a href="${escAttr(n.link)}" target="_blank" class="btn btn-primary" style="flex:1; text-decoration:none; font-size:0.88rem; padding:8px; text-align:center;">Access</a>
            </div>
        </div>
    `}).join('');
}

function renderSavedSection() {
    const container = document.getElementById('savedContainer');
    if (!container) return;
    const bm = getBookmarks();
    
    const searchInputEl = document.getElementById('searchInput');
    const search = searchInputEl ? searchInputEl.value.toLowerCase() : '';

    let saved = allPapers.filter(p => bm.includes(p.id));

    if (search) {
        saved = saved.filter(p => p.subject.toLowerCase().includes(search));
    }

    if (!saved.length) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted);"><p style="font-size:1.1rem; font-weight:600;">No saved documents.</p><p>Select the star icon on any document card to save it to this section.</p></div>';
        return;
    }

    container.innerHTML = '';
    saved.forEach(p => {
        container.appendChild(buildCard(p));
    });
}

function buildCard(p) {
    const examClass = p.examType === 'MSE' ? 'tag-mse' : (p.examType === 'ESE' ? 'tag-ese' : 'tag-sem');
    const info = `<span>Date: ${new Date(p.date).toLocaleDateString('en-IN')}</span><span>Source: ${escAttr(p.creatorName)}</span>`;

    const bookmarked = isBookmarked(p.id);
    const bmClass = bookmarked ? 'card-icon-btn bm-btn bookmarked' : 'card-icon-btn bm-btn';
    const bmIcon = bookmarked ? '★' : '☆';

    const card = document.createElement('div');
    card.className = 'card';

    const footer = document.createElement('div');
    footer.className = 'card-footer';

    if (p.link) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'btn btn-outline';
        previewBtn.style.cssText = 'flex:1; justify-content:center;';
        previewBtn.textContent = 'Preview';
        previewBtn.addEventListener('click', () => window.openPdfPreview(p.subject, p.link));

        const accessLink = document.createElement('a');
        accessLink.href = p.link;
        accessLink.target = '_blank';
        accessLink.className = 'btn btn-primary';
        accessLink.style.cssText = 'flex:1; justify-content:center; text-decoration:none;';
        accessLink.textContent = 'Access';

        const iconActions = document.createElement('div');
        iconActions.className = 'card-icon-actions';

        const bmBtn = document.createElement('button');
        bmBtn.className = bmClass;
        bmBtn.dataset.id = p.id;
        bmBtn.title = bookmarked ? 'Remove from saved' : 'Save document';
        bmBtn.textContent = bmIcon;
        bmBtn.style.cssText = 'font-size: 1.1rem; padding: 4px 8px;';
        bmBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.toggleBookmark(p.id);
        });

        const reportBtn = document.createElement('button');
        reportBtn.className = 'card-icon-btn';
        reportBtn.title = 'Report discrepancy';
        reportBtn.textContent = 'Report';
        reportBtn.style.cssText = 'font-size: 0.85rem; font-weight:600;';
        reportBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.openReportModal({ id: p.id, subject: p.subject, link: p.link });
        });

        iconActions.appendChild(bmBtn);
        iconActions.appendChild(reportBtn);

        footer.appendChild(previewBtn);
        footer.appendChild(accessLink);
        footer.appendChild(iconActions);
    }

    const docTags = p.docType === 'paper'
        ? `<span class="tag ${examClass}">${escAttr(p.examType)}</span>
           ${p.examYear !== '---' ? `<span class="tag tag-year-num">${escAttr(String(p.examYear))}</span>` : ''}`
        : `<span class="tag" style="background:#e2e8f0; color:#334155;">${p.docType === 'notes' ? 'Class Notes' : 'Syllabus'}</span>`;

    card.innerHTML = `
        <div class="card-header">
            <h3 class="card-title">${escAttr(p.subject)}</h3>
            <div class="card-tags">
                <span class="tag tag-sem">${escAttr(p.year)} ${p.sem === '---' ? '' : '• ' + escAttr(p.sem)}</span>
                ${docTags}
            </div>
        </div>
        <div class="card-body"><div class="card-info">${info}</div></div>
    `;
    card.appendChild(footer);
    return card;
}

let currentTab = 'papers';

window.switchTab = (tab) => {
    currentTab = tab;
    const tabs = ['papers', 'notes', 'leaderboard', 'saved'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab${t.charAt(0).toUpperCase() + t.slice(1)}`);
        if (btn) btn.classList.toggle('active', t === tab);
    });

    document.getElementById('itemsContainer').style.display = tab === 'papers' ? 'grid' : 'none';
    document.getElementById('filterGroup').closest('.filter-bar').style.display = tab === 'papers' ? '' : 'block';
    document.getElementById('notesSection').style.display = tab === 'notes' ? 'block' : 'none';
    document.getElementById('leaderboardSection').style.display = tab === 'leaderboard' ? 'block' : 'none';
    document.getElementById('savedSection').style.display = tab === 'saved' ? 'block' : 'none';

    const loadBtn = document.getElementById('loadMoreBtn');
    if (loadBtn) {
        loadBtn.style.display = tab === 'papers' ? '' : 'none';
    }

    if (tab !== 'papers') {
        const g = document.getElementById('filterGroup');
        const arrow = document.getElementById('filterArrow');
        if (g) { g.classList.remove('show'); g.style.display = 'none'; }
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    }

    const filterBar = document.querySelector('.filter-bar');
    if (filterBar) filterBar.style.marginTop = tab === 'papers' ? '' : '1rem';

    if (tab === 'notes') renderNotes();
    if (tab === 'leaderboard') renderLeaderboard();
    if (tab === 'saved') renderSavedSection();
};

window.renderPapers = (resetPage = true) => {
    const container = document.getElementById('itemsContainer');

    if (resetPage) {
        currentPage = 1;
        container.innerHTML = '';
    }

    const year = document.getElementById('filterYear').value;
    const sem = document.getElementById('filterSem').value;
    const branch = document.getElementById('filterBranch').value;
    const exam = document.getElementById('filterExam').value;
    const subject = document.getElementById('filterSubject').value;
    const search = document.getElementById('searchInput').value.toLowerCase();
    const sortEl = document.getElementById('filterSort');
    const sort = sortEl ? sortEl.value : 'newest';

    let filtered = allPapers.filter(p => {
        if (p.docType !== 'paper') return false;
        if (year !== 'all' && p.year !== year) return false;
        if (sem !== 'all' && p.sem !== sem) return false;
        if (exam !== 'all' && p.examType !== exam) return false;
        if (branch !== 'all') {
            if (p.year !== 'FY' && p.branch !== branch && p.branch !== 'Common') return false;
        }
        if (subject !== 'all' && p.subject !== subject) return false;
        if (search && !p.subject.toLowerCase().includes(search)) return false;
        return true;
    });

    filtered.sort((a, b) => {
        const yearA = parseInt(String(a.examYear).replace(/\D/g, '')) || 0;
        const yearB = parseInt(String(b.examYear).replace(/\D/g, '')) || 0;
        
        const dateA = new Date(a.date).getTime() || 0;
        const dateB = new Date(b.date).getTime() || 0;

        if (sort === 'newest') {
            if (yearA !== yearB) return yearB - yearA; 
            return dateB - dateA;
        }
        if (sort === 'oldest') {
            if (yearA !== yearB) return yearA - yearB;
            return dateA - dateB;
        }
        if (sort === 'az') return a.subject.localeCompare(b.subject);
        return 0;
    });

    if (!filtered.length && resetPage) {
        container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted);"><p style="font-size:1.05rem; font-weight:600;">No examination documents found matching the selected criteria.</p></div>';
        const oldBtn = document.getElementById('loadMoreBtn');
        if (oldBtn) oldBtn.remove();
        return;
    }

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    paginatedItems.forEach(p => container.appendChild(buildCard(p)));

    let loadMoreBtn = document.getElementById('loadMoreBtn');

    if (startIndex + ITEMS_PER_PAGE < filtered.length) {
        if (!loadMoreBtn) {
            loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'loadMoreBtn';
            loadMoreBtn.className = 'btn btn-outline';
            loadMoreBtn.style.cssText = 'display: block; margin: 2rem auto; width: 220px;';
            loadMoreBtn.textContent = 'Load More Documents';
            loadMoreBtn.onclick = () => {
                currentPage++;
                window.renderPapers(false);
            };
            container.parentNode.insertBefore(loadMoreBtn, container.nextSibling);
        }
    } else if (loadMoreBtn) {
        loadMoreBtn.remove();
    }
};

window.toggleFilters = () => {
    const g = document.getElementById('filterGroup');
    g.classList.toggle('show');
    document.getElementById('filterArrow').style.transform = g.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
    g.style.display = g.classList.contains('show') ? 'grid' : 'none';
};

window.updateFilters = () => {
    const year = document.getElementById('filterYear').value;
    const branchContainer = document.getElementById('filterBranchContainer');
    const semSelect = document.getElementById('filterSem');

    branchContainer.style.display = year === 'FY' ? 'none' : 'block';

    semSelect.innerHTML = '<option value="all">All Semesters</option>';

    let sems = [];
    if (year === 'all') sems = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Sem 5', 'Sem 6', 'Sem 7', 'Sem 8'];
    else if (year === 'FY') sems = ['Sem 1', 'Sem 2'];
    else if (year === 'SY') sems = ['Sem 3', 'Sem 4'];
    else if (year === 'TY') sems = ['Sem 5', 'Sem 6'];
    else if (year === 'BTech') sems = ['Sem 7', 'Sem 8'];

    sems.forEach(s => semSelect.add(new Option(s.replace('Sem', 'Semester '), s)));

    window.updateSubjectDropdown();
};

window.updateSubjectDropdown = () => {
    const year = document.getElementById('filterYear').value;
    const branch = document.getElementById('filterBranch').value;
    const sem = document.getElementById('filterSem').value;
    const subSelect = document.getElementById('filterSubject');

    let subjects = new Set();

    allPapers.forEach(p => {
        if (p.docType === 'paper') {
            const yearMatch = year === 'all' || p.year === year;
            const semMatch = sem === 'all' || p.sem === sem;
            const branchMatch = branch === 'all' || p.branch === branch || p.year === 'FY' || p.branch === 'Common';

            if (yearMatch && semMatch && branchMatch) {
                subjects.add(p.subject);
            }
        }
    });

    const currentSelected = subSelect.value;
    subSelect.innerHTML = '<option value="all">All Subjects</option>';

    Array.from(subjects).sort().forEach(s => {
        const opt = new Option(s, s);
        if (s === currentSelected) opt.selected = true;
        subSelect.add(opt);
    });

    window.triggerFilter(true);
};

const savedDark = lsGet('coep_dark', null);
if (savedDark !== null) {
    applyDarkMode(savedDark);
} else {
    applyDarkMode(false);
}

updateBookmarkBadge();
window.updateFilters();
