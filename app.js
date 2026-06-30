/**
 * app.js - Legium Main Application Controller
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- STATE VARIABLES ---
  let activeTab = "dashboard";
  let activeCaseId = null;
  const pdfSessionUrls = new Map([
    ["doc-mock-001", "/mock_pdfs/Demanda_Civil_Reivindicacion.pdf"],
    ["doc-mock-002", "/mock_pdfs/Recurso_Apelacion_Penal.pdf"],
    ["doc-mock-003", "/mock_pdfs/Contrato_Fusion_Corporativo.pdf"],
    ["doc-mock-004", "/mock_pdfs/Demanda_Laboral_Despido.pdf"],
    ["doc-mock-005", "/mock_pdfs/Reclamacion_Tributaria_SII.pdf"],
    ["doc-mock-006", "/mock_pdfs/Contestacion_INAPI_Patente.pdf"],
    ["doc-mock-007", "/mock_pdfs/Demanda_Familia_Divorcio.pdf"],
    ["doc-mock-008", "/mock_pdfs/Demanda_Competencia_Desleal.pdf"]
  ]); // Store temporary Object URLs or static mock paths in-memory

  let currentFilterArea = "Todas";
  let currentFilterStatus = "Todos";

  // --- HTML ELEMENT REFERENCES ---
  const sidebarItems = document.querySelectorAll(".sidebar-menu .menu-item");
  const viewPanels = document.querySelectorAll(".view-panel");
  const mobileToggle = document.getElementById("mobile-toggle");
  const sidebar = document.getElementById("sidebar");
  const roleSelect = document.getElementById("simulator-role-select");
  const searchInput = document.getElementById("universal-search");

  // Current user displays
  const currentAvatar = document.getElementById("current-user-avatar");
  const currentName = document.getElementById("current-user-name");
  const currentRole = document.getElementById("current-user-role");
  const dashSessionRole = document.getElementById("dash-session-role");
  const dashPermCases = document.getElementById("dash-perm-cases");
  const dashPermFinance = document.getElementById("dash-perm-finance");
  const dashPermTi = document.getElementById("dash-perm-ti");

  // Dashboard Metrics
  const activeCasesMetric = document.getElementById("metric-active-cases");
  const appealingCasesMetric = document.getElementById("metric-appealing-cases");
  const totalClientsMetric = document.getElementById("metric-total-clients");
  const totalRevenueMetric = document.getElementById("metric-total-revenue");

  // Dashboard Containers
  const dashMilestonesTable = document.querySelector("#dashboard-milestones-table tbody");
  const dashTasksContainer = document.getElementById("dashboard-tasks-container");
  const dashLogsContainer = document.getElementById("dashboard-logs-container");

  // Cases Elements
  const casesListPanel = document.getElementById("cases-list-panel");
  const caseDetailPanel = document.getElementById("case-detail-panel");
  const casesTableBody = document.querySelector("#cases-table tbody");
  const casesCountLabel = document.getElementById("cases-count-label");

  // Case Detail elements
  const detailCaseId = document.getElementById("detail-case-id");
  const detailCaseTitle = document.getElementById("detail-case-title");
  const detailCaseClient = document.getElementById("detail-case-client");
  const detailCaseOpposing = document.getElementById("detail-case-opposing");
  const detailCaseOpposingLawyer = document.getElementById("detail-case-opposing-lawyer");
  const detailCaseArea = document.getElementById("detail-case-area");
  const detailCaseCourt = document.getElementById("detail-case-court");
  const detailCaseJudge = document.getElementById("detail-case-judge");
  const detailCaseLawyer = document.getElementById("detail-case-lawyer");
  const detailCaseStartDate = document.getElementById("detail-case-start-date");
  const detailCaseDesc = document.getElementById("detail-case-desc");
  const detailCaseStatusBadge = document.getElementById("detail-case-badge-status");
  
  const detailCaseTimeline = document.getElementById("detail-case-timeline");
  const detailCaseTasks = document.getElementById("detail-case-tasks");
  const detailCaseNotes = document.getElementById("detail-case-notes");
  const noteInput = document.getElementById("note-input");

  // Clients Elements
  const clientsTableBody = document.querySelector("#clients-table tbody");

  // Reports elements
  const reportsLawyersTableBody = document.querySelector("#reports-lawyers-table tbody");
  const reportsBlockedOverlay = document.getElementById("reports-blocked-overlay");

  // TI Admin elements
  const itBlockedOverlay = document.getElementById("it-blocked-overlay");
  const itUsersTableBody = document.querySelector("#it-users-table tbody");
  const itLogsContainer = document.getElementById("it-logs-container");
  const healthDbIndicator = document.getElementById("health-db-indicator");
  const healthLatencyIndicator = document.getElementById("health-latency-indicator");
  const healthLatencyValue = document.getElementById("health-latency-value");
  const healthBackupStatus = document.getElementById("health-backup-status");

  // Modals
  const modals = document.querySelectorAll(".modal");
  const modalCloseButtons = document.querySelectorAll("[data-close]");
  const modalOpenCreateCase = document.getElementById("btn-open-create-case-modal");
  const modalOpenCreateClient = document.getElementById("btn-open-create-client-modal");
  const modalOpenCreateUser = document.getElementById("btn-open-create-user-modal");
  const btnAddMilestone = document.getElementById("btn-add-milestone");
  const btnAddTask = document.getElementById("btn-add-task");

  // Forms
  const formCreateCase = document.getElementById("form-create-case");
  const formCreateClient = document.getElementById("form-create-client");
  const formCreateMilestone = document.getElementById("form-create-milestone");
  const formCreateTask = document.getElementById("form-create-task");
  const formCreateUser = document.getElementById("form-create-user");



  // Toast Container
  const toastContainer = document.getElementById("alert-container");


  // --- INITIALIZATION ---
  function init() {
    setupRouting();
    setupSimulator();
    setupModals();
    setupForms();
    setupSearchFilters();
    setupITControls();
    setupPDFManager();
    
    // Set initial simulator dropdown value
    const currentUser = window.LegiumDB.getCurrentUser();
    roleSelect.value = currentUser.id;
    
    // Load active view
    const hash = window.location.hash.replace("#", "") || "dashboard";
    switchTab(hash);
    
    applyRolePermissions(currentUser);
    renderAll();
    
    // Load Chart.js initially
    if (window.LegiumCharts) {
      window.LegiumCharts.init();
    }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(title, message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `alert-toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">&times;</button>
    `;
    
    // Close button event
    toast.querySelector(".toast-close").addEventListener("click", () => {
      toast.remove();
    });
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = "fadeIn 0.3s reverse forwards";
        setTimeout(() => toast.remove(), 300);
      }
    }, 4000);
  }

  // --- SPA ROUTING ---
  function setupRouting() {
    sidebarItems.forEach(item => {
      item.addEventListener("click", (e) => {
        const tab = item.getAttribute("data-tab");
        switchTab(tab);
      });
    });

    window.addEventListener("hashchange", () => {
      const tab = window.location.hash.replace("#", "") || "dashboard";
      switchTab(tab);
    });
    
    // Mobile sidebar toggle
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
    });
  }

  function switchTab(tab) {
    if (!["dashboard", "cases", "clients", "reports", "it-admin"].includes(tab)) {
      tab = "dashboard";
    }
    
    activeTab = tab;
    
    // Update Sidebar CSS
    sidebarItems.forEach(item => {
      if (item.getAttribute("data-tab") === tab) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update Panels
    viewPanels.forEach(panel => {
      if (panel.id === `view-${tab}`) {
        panel.classList.add("active");
      } else {
        panel.classList.remove("active");
      }
    });

    // Close mobile menu if open
    sidebar.classList.remove("mobile-open");

    // Scroll to top of page container
    document.querySelector(".page-container").scrollTop = 0;

    // Special actions when entering views
    if (tab === "cases") {
      // Return to list when clicking menu button
      casesListPanel.style.display = "block";
      caseDetailPanel.style.display = "none";
      activeCaseId = null;
    }

    if (tab === "clients") {
      document.getElementById("clients-list-panel").style.display = "block";
      document.getElementById("client-detail-panel").style.display = "none";
    }
    
    if (tab === "reports" && window.LegiumCharts) {
      setTimeout(() => window.LegiumCharts.update(), 100);
    }
  }

  // --- ROLE SIMULATION & SECURITY ---
  function setupSimulator() {
    roleSelect.addEventListener("change", (e) => {
      const userId = e.target.value;
      const users = window.LegiumDB.get("users", []);
      const selectedUser = users.find(u => u.id === userId);
      
      if (selectedUser) {
        window.LegiumDB.setCurrentUser(selectedUser);
        applyRolePermissions(selectedUser);
        showToast("Cambio de Rol Exitoso", `Ahora estás navegando como ${selectedUser.name} (${selectedUser.role}).`, "success");
        
        // Re-render UI elements
        renderAll();
        
        // If current tab is reports or it-admin, update chart or logs
        if (activeTab === "reports" && window.LegiumCharts) {
          window.LegiumCharts.update();
        }
      }
    });
  }

  function applyRolePermissions(user) {
    // Update Welcome Banner
    const welcomeUser = document.getElementById("welcome-user-name");
    if (welcomeUser) {
      welcomeUser.innerText = user.name.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, "").split(" ")[0];
    }

    // Update Badge
    currentAvatar.innerText = user.avatar;
    currentAvatar.style.border = user.role === "TI Administrador" ? "2px solid var(--danger)" : "2px solid var(--primary-gold)";
    currentName.innerText = user.name;
    currentRole.innerText = user.role;

    // Update dashboard privileges details
    dashSessionRole.innerText = user.role;
    
    if (user.role === "TI Administrador") {
      dashPermCases.innerText = "ACCESO TOTAL";
      dashPermCases.className = "badge badge-active";
      dashPermFinance.innerText = "ACCESO TOTAL";
      dashPermFinance.className = "badge badge-active";
      dashPermTi.innerText = "HABILITADO";
      dashPermTi.className = "badge badge-active";
      
      reportsBlockedOverlay.classList.remove("permission-blocked");
      itBlockedOverlay.classList.remove("permission-blocked");
      document.getElementById("menu-it-admin").style.display = "block";
    } 
    else if (user.role === "Socio Principal") {
      dashPermCases.innerText = "ACCESO TOTAL";
      dashPermCases.className = "badge badge-active";
      dashPermFinance.innerText = "ACCESO TOTAL";
      dashPermFinance.className = "badge badge-active";
      dashPermTi.innerText = "RESTRINGIDO";
      dashPermTi.className = "badge badge-suspended";
      
      reportsBlockedOverlay.classList.remove("permission-blocked");
      itBlockedOverlay.classList.add("permission-blocked");
      document.getElementById("menu-it-admin").style.display = "none";
      if (activeTab === "it-admin") switchTab("dashboard");
    } 
    else if (user.role === "Abogado Senior") {
      dashPermCases.innerText = "PROPIOS Y ASIGNADOS";
      dashPermCases.className = "badge badge-appealing";
      dashPermFinance.innerText = "RESTRINGIDO";
      dashPermFinance.className = "badge badge-suspended";
      dashPermTi.innerText = "RESTRINGIDO";
      dashPermTi.className = "badge badge-suspended";
      
      reportsBlockedOverlay.classList.add("permission-blocked");
      itBlockedOverlay.classList.add("permission-blocked");
      document.getElementById("menu-it-admin").style.display = "none";
      if (activeTab === "it-admin" || activeTab === "reports") switchTab("dashboard");
    } 
    else if (user.role === "Abogado Junior") {
      dashPermCases.innerText = "SOLO ASIGNADOS";
      dashPermCases.className = "badge badge-suspended";
      dashPermFinance.innerText = "BLOQUEADO";
      dashPermFinance.className = "badge badge-closed";
      dashPermTi.innerText = "RESTRINGIDO";
      dashPermTi.className = "badge badge-suspended";
      
      reportsBlockedOverlay.classList.add("permission-blocked");
      itBlockedOverlay.classList.add("permission-blocked");
      document.getElementById("menu-it-admin").style.display = "none";
      if (activeTab === "it-admin" || activeTab === "reports") switchTab("dashboard");
    }
  }

  // --- DATA RENDERING SYSTEM ---
  function renderAll() {
    renderDashboardMetrics();
    renderDashboardLists();
    renderCasesList();
    renderClientsList();
    renderReportsTable();
    renderITAdminSection();
    populateFormSelects();
  }

  function renderDashboardMetrics() {
    const cases = window.LegiumDB.get("cases", []);
    const clients = window.LegiumDB.get("clients", []);
    const financials = window.LegiumDB.get("financials", {});

    const activeCases = cases.filter(c => c.status === "Activo").length;
    const appealingCases = cases.filter(c => c.status === "En Apelación").length;
    
    activeCasesMetric.innerText = activeCases;
    appealingCasesMetric.innerText = appealingCases;
    totalClientsMetric.innerText = clients.length;
    totalRevenueMetric.innerText = "$" + financials.summary.totalRevenue.toLocaleString();
  }

  function renderDashboardLists() {
    const cases = window.LegiumDB.get("cases", []);
    const logs = window.LegiumDB.get("logs", []);
    const currentUser = window.LegiumDB.getCurrentUser();

    // Render 5 upcoming milestones
    dashMilestonesTable.innerHTML = "";
    let milestones = [];
    cases.forEach(c => {
      c.timeline.forEach(t => {
        if (!t.completed) {
          milestones.push({
            date: t.date,
            caseId: c.id,
            caseTitle: c.title,
            title: t.title
          });
        }
      });
    });

    // Sort by date ascending
    milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
    const upcomingMilestones = milestones.slice(0, 4);

    if (upcomingMilestones.length === 0) {
      dashMilestonesTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No hay hitos pendientes programados.</td></tr>`;
    } else {
      upcomingMilestones.forEach(m => {
        const row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          viewCaseDetail(m.caseId);
        });
        row.innerHTML = `
          <td style="color: var(--primary-gold); font-weight: 600;">${m.date}</td>
          <td>${m.caseTitle} <span class="metric-sub">(${m.caseId})</span></td>
          <td>${m.title}</td>
          <td><span class="badge badge-suspended">Pendiente</span></td>
        `;
        dashMilestonesTable.appendChild(row);
      });
    }

    // Render 4 tasks (either assigned to user, or pending in general if Admin/Partner)
    dashTasksContainer.innerHTML = "";
    let tasks = [];
    cases.forEach(c => {
      c.tasks.forEach(t => {
        if (!t.completed) {
          tasks.push({
            id: t.id,
            caseId: c.id,
            title: t.title,
            dueDate: t.dueDate,
            assignedTo: t.assignedTo
          });
        }
      });
    });

    // Filter tasks if Junior or Senior
    if (currentUser.role === "Abogado Junior" || currentUser.role === "Abogado Senior") {
      tasks = tasks.filter(t => t.assignedTo === currentUser.id);
    }

    tasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    const dashboardTasks = tasks.slice(0, 4);

    if (dashboardTasks.length === 0) {
      dashTasksContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px;">No tienes tareas pendientes asignadas.</div>`;
    } else {
      dashboardTasks.forEach(t => {
        const item = document.createElement("div");
        item.className = "task-item";
        item.innerHTML = `
          <div class="checkbox-custom" data-task-id="${t.id}" data-case-id="${t.caseId}">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span class="task-label">${t.title} <span class="metric-sub" style="cursor:pointer;" onclick="window.location.hash='#cases'; event.stopPropagation();">(${t.caseId})</span></span>
          <span class="task-date">${t.dueDate}</span>
        `;
        
        // Checkbox click handler
        item.querySelector(".checkbox-custom").addEventListener("click", function() {
          this.classList.toggle("checked");
          item.classList.toggle("completed");
          setTimeout(() => {
            toggleTaskStatus(t.caseId, t.id);
          }, 400);
        });

        dashTasksContainer.appendChild(item);
      });
    }

    // Render 4 quick logs
    dashLogsContainer.innerHTML = "";
    const quickLogs = logs.slice(0, 4);
    quickLogs.forEach(l => {
      const item = document.createElement("div");
      item.className = "audit-log-item";
      item.innerHTML = `
        <div class="audit-log-status ${l.status.toLowerCase()}"></div>
        <div class="audit-log-details">
          <div class="audit-log-text"><strong>${l.userName}:</strong> ${l.action}</div>
          <div class="audit-log-meta">
            <span class="audit-log-time">${l.timestamp}</span>
            <span>•</span>
            <span>${l.userRole}</span>
          </div>
        </div>
      `;
      dashLogsContainer.appendChild(item);
    });
  }

  function renderCasesList() {
    const cases = window.LegiumDB.get("cases", []);
    const searchVal = searchInput.value.toLowerCase().trim();
    const areaVal = currentFilterArea;
    const statusVal = currentFilterStatus;
    const currentUser = window.LegiumDB.getCurrentUser();

    casesTableBody.innerHTML = "";
    
    // Filter cases based on security permissions first
    let filteredCases = cases;
    if (currentUser.role === "Abogado Junior") {
      filteredCases = cases.filter(c => c.assignedLawyerId === currentUser.id);
    }

    // Apply filters
    filteredCases = filteredCases.filter(c => {
      const matchesDocName = c.documents && c.documents.some(doc => doc.name.toLowerCase().includes(searchVal));
      const matchesSearch = c.title.toLowerCase().includes(searchVal) || 
                            c.id.toLowerCase().includes(searchVal) || 
                            c.clientName.toLowerCase().includes(searchVal) ||
                            c.assignedLawyerName.toLowerCase().includes(searchVal) ||
                            matchesDocName;
      const matchesArea = areaVal === "Todas" || c.practiceArea === areaVal;
      const matchesStatus = statusVal === "Todos" || c.status === statusVal;

      return matchesSearch && matchesArea && matchesStatus;
    });

    casesCountLabel.innerText = `Mostrando ${filteredCases.length} expedientes`;

    if (filteredCases.length === 0) {
      casesTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No se encontraron expedientes con los criterios seleccionados.</td></tr>`;
      return;
    }

    filteredCases.forEach(c => {
      const row = document.createElement("tr");
      
      let badgeClass = "badge-active";
      if (c.status === "Cerrado") badgeClass = "badge-closed";
      else if (c.status === "En Apelación") badgeClass = "badge-appealing";
      else if (c.status === "Suspendido") badgeClass = "badge-suspended";

      row.innerHTML = `
        <td style="color: var(--primary-gold); font-weight: 600;">${c.id}</td>
        <td style="font-weight: 600;">${c.title}</td>
        <td>${c.clientName}</td>
        <td>${c.practiceArea}</td>
        <td><span class="badge ${badgeClass}">${c.status}</span></td>
        <td>${c.assignedLawyerName}</td>
        <td>
          <button class="btn btn-secondary btn-sm btn-view-case" data-id="${c.id}">Ver Ficha</button>
        </td>
      `;

      row.querySelector(".btn-view-case").addEventListener("click", () => {
        viewCaseDetail(c.id);
      });

      casesTableBody.appendChild(row);
    });
  }

  function viewCaseDetail(caseId) {
    const cases = window.LegiumDB.get("cases", []);
    const c = cases.find(item => item.id === caseId);
    
    if (!c) {
      showToast("Error", "No se encontró el expediente solicitado.", "danger");
      return;
    }

    // Security Check: Junior lawyers can only view cases assigned to them
    const currentUser = window.LegiumDB.getCurrentUser();
    if (currentUser.role === "Abogado Junior" && c.assignedLawyerId !== currentUser.id) {
      window.LegiumDB.addLog(currentUser.id, `Intento no autorizado de visualización de expediente ${caseId}`, "Denied");
      showToast("Acceso Denegado", "No tienes permisos para visualizar este expediente.", "danger");
      return;
    }

    activeCaseId = caseId;
    
    // Switch to cases tab if we aren't there
    if (activeTab !== "cases") {
      switchTab("cases");
    }

    casesListPanel.style.display = "none";
    caseDetailPanel.style.display = "block";

    // Bind general case details
    detailCaseId.innerText = c.id;
    detailCaseTitle.innerText = c.title;
    detailCaseClient.innerText = c.clientName;
    detailCaseOpposing.innerText = c.opposingParty || "No registrada";
    detailCaseOpposingLawyer.innerText = c.opposingLawyer || "No registrado";
    detailCaseArea.innerText = c.practiceArea;
    detailCaseCourt.innerText = c.court;
    detailCaseJudge.innerText = c.judge || "No asignado";
    detailCaseLawyer.innerText = c.assignedLawyerName;
    detailCaseStartDate.innerText = c.startDate;
    detailCaseDesc.innerText = c.description;

    // Status Badge
    let badgeClass = "badge-active";
    if (c.status === "Cerrado") badgeClass = "badge-closed";
    else if (c.status === "En Apelación") badgeClass = "badge-appealing";
    else if (c.status === "Suspendido") badgeClass = "badge-suspended";
    
    detailCaseStatusBadge.className = `badge ${badgeClass}`;
    detailCaseStatusBadge.innerText = c.status;

    // Log case view action
    window.LegiumDB.addLog(currentUser.id, `Visualización de expediente detallado ${c.id}`, "Success");
    
    // Render detail sub-sections
    renderCaseDetailTimeline(c);
    renderCaseDetailTasks(c);
    renderCaseDetailNotes(c);
    renderCaseDetailDocuments(c);
  }

  function renderCaseDetailTimeline(c) {
    detailCaseTimeline.innerHTML = "";
    if (c.timeline.length === 0) {
      detailCaseTimeline.innerHTML = `<p style="color: var(--text-muted); font-size: 13px;">No hay hites procesales registrados.</p>`;
      return;
    }

    // Sort timeline: completed first, then by date descending
    const sortedTimeline = [...c.timeline].sort((a,b) => new Date(b.date) - new Date(a.date));

    sortedTimeline.forEach((t, idx) => {
      const item = document.createElement("div");
      item.className = `timeline-item ${t.completed ? "completed" : ""}`;
      item.innerHTML = `
        <div class="timeline-dot"></div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
          <div class="timeline-date">${t.date}</div>
          <input type="checkbox" ${t.completed ? "checked" : ""} class="switch-timeline" style="cursor: pointer; accent-color: var(--primary-gold);" data-idx="${c.timeline.indexOf(t)}">
        </div>
        <div class="timeline-title">${t.title}</div>
        <div class="timeline-desc">${t.desc}</div>
      `;

      // Handle timeline checkbox toggle
      item.querySelector(".switch-timeline").addEventListener("change", (e) => {
        const originalIdx = e.target.getAttribute("data-idx");
        toggleMilestoneStatus(c.id, parseInt(originalIdx), e.target.checked);
      });

      detailCaseTimeline.appendChild(item);
    });
  }

  function renderCaseDetailTasks(c) {
    detailCaseTasks.innerHTML = "";
    if (c.tasks.length === 0) {
      detailCaseTasks.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 10px;">No hay tareas en este expediente.</p>`;
      return;
    }

    c.tasks.forEach(t => {
      const item = document.createElement("div");
      item.className = `task-item ${t.completed ? "completed" : ""}`;
      item.innerHTML = `
        <div class="checkbox-custom ${t.completed ? "checked" : ""}">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <span class="task-label">${t.title}</span>
        <span class="task-date">${t.dueDate}</span>
      `;

      item.querySelector(".checkbox-custom").addEventListener("click", () => {
        toggleTaskStatus(c.id, t.id);
      });

      detailCaseTasks.appendChild(item);
    });
  }

  function renderCaseDetailNotes(c) {
    detailCaseNotes.innerHTML = "";
    if (c.notes.length === 0) {
      detailCaseNotes.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; padding: 10px; text-align: center;">No hay notas internas registradas en este caso.</p>`;
      return;
    }

    // Sort notes by date descending
    const sortedNotes = [...c.notes].sort((a,b) => new Date(b.date.replace(" ", "T")) - new Date(a.date.replace(" ", "T")));

    sortedNotes.forEach(n => {
      const card = document.createElement("div");
      card.className = "note-card";
      card.innerHTML = `
        <div class="note-meta">
          <span>${n.author}</span>
          <span>${n.date}</span>
        </div>
        <div class="note-text">${n.text}</div>
      `;
      detailCaseNotes.appendChild(card);
    });
  }

  function renderCaseDetailDocuments(c) {
    const docContainer = document.getElementById("detail-case-documents");
    if (!docContainer) return;
    docContainer.innerHTML = "";

    if (!c.documents || c.documents.length === 0) {
      docContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;">No hay documentos PDF cargados en este expediente.</p>`;
      return;
    }

    c.documents.forEach(doc => {
      const item = document.createElement("div");
      item.className = "document-item";
      item.innerHTML = `
        <div class="doc-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        </div>
        <div class="doc-info">
          <div class="doc-name" title="${doc.name}">${doc.name}</div>
          <div class="doc-meta">${doc.size} • ${doc.uploadDate}</div>
        </div>
        <div class="doc-actions">
          <button class="btn btn-secondary btn-sm btn-view-doc" data-id="${doc.id}">Visualizar</button>
          <button class="btn btn-danger btn-sm btn-delete-doc" data-id="${doc.id}" style="padding: 6px 10px; min-width: unset; font-size: 14px; display: flex; align-items: center; justify-content: center;">&times;</button>
        </div>
      `;

      item.querySelector(".btn-view-doc").addEventListener("click", () => {
        openPDFViewer(doc.id, doc.name);
      });

      item.querySelector(".btn-delete-doc").addEventListener("click", () => {
        if (confirm(`¿Está seguro de eliminar el documento "${doc.name}"?`)) {
          deleteDocument(c.id, doc.id);
        }
      });

      docContainer.appendChild(item);
    });
  }

  function deleteDocument(caseId, docId) {
    const currentUser = window.LegiumDB.getCurrentUser();
    if (currentUser.role === "Abogado Junior") {
      window.LegiumDB.addLog(currentUser.id, `Intento no autorizado de eliminar documento en caso ${caseId}`, "Denied");
      showToast("Acceso Denegado", "Los Abogados Junior no tienen permisos para eliminar documentos.", "danger");
      return;
    }

    const cases = window.LegiumDB.get("cases", []);
    const c = cases.find(item => item.id === caseId);
    if (c && c.documents) {
      const docIndex = c.documents.findIndex(d => d.id === docId);
      if (docIndex !== -1) {
        const docName = c.documents[docIndex].name;
        c.documents.splice(docIndex, 1);
        window.LegiumDB.set("cases", cases);

        // Revoke Object URL if active
        if (pdfSessionUrls.has(docId)) {
          URL.revokeObjectURL(pdfSessionUrls.get(docId));
          pdfSessionUrls.delete(docId);
        }

        window.LegiumDB.addLog(currentUser.id, `Eliminado documento PDF '${docName}' en caso ${caseId}`, "Warning");
        showToast("Documento Eliminado", `El archivo '${docName}' fue removido de la ficha.`, "warning");

        viewCaseDetail(caseId);
      }
    }
  }

  function openPDFViewer(docId, docName) {
    const title = document.getElementById("pdf-viewer-title");
    const iframe = document.getElementById("pdf-viewer-iframe");
    const fallback = document.getElementById("pdf-viewer-fallback");
    const reuploadBtn = document.getElementById("btn-reupload-pdf-viewer");

    title.innerText = `Visualizar: ${docName}`;
    reuploadBtn.setAttribute("data-doc-id", docId);

    const objUrl = pdfSessionUrls.get(docId);
    if (objUrl) {
      iframe.src = objUrl;
      iframe.style.display = "block";
      fallback.style.display = "none";
    } else {
      iframe.src = "";
      iframe.style.display = "none";
      fallback.style.display = "block";
    }

    openModal("modal-view-pdf");
  }

  function handlePDFUpload(file) {
    if (!activeCaseId) return;
    if (file.type !== "application/pdf") {
      showToast("Formato Inválido", "Solo se admiten archivos en formato PDF.", "danger");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("Archivo muy grande", "El tamaño máximo permitido es 10MB.", "danger");
      return;
    }

    const cases = window.LegiumDB.get("cases", []);
    const c = cases.find(item => item.id === activeCaseId);

    if (c) {
      if (!c.documents) c.documents = [];

      const docId = `doc-${Date.now()}`;
      const uploadDate = new Date().toISOString().split('T')[0];
      
      let sizeStr = "";
      if (file.size < 1024 * 1024) {
        sizeStr = `${(file.size / 1024).toFixed(1)} KB`;
      } else {
        sizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      }

      const docObj = {
        id: docId,
        name: file.name,
        size: sizeStr,
        uploadDate: uploadDate
      };

      c.documents.push(docObj);
      window.LegiumDB.set("cases", cases);

      // Create Object URL and store in session Map
      const objUrl = URL.createObjectURL(file);
      pdfSessionUrls.set(docId, objUrl);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(currentUser.id, `Cargado documento PDF '${file.name}' en caso ${activeCaseId}`, "Success");
      showToast("Documento Cargado", `El PDF '${file.name}' se ha cargado con éxito.`, "success");

      viewCaseDetail(activeCaseId);
    }
  }

  function setupPDFManager() {
    const dropZone = document.getElementById("pdf-drop-zone");
    const fileInput = document.getElementById("case-pdf-input");
    const reuploadBtn = document.getElementById("btn-reupload-pdf-viewer");

    if (!dropZone || !fileInput || !reuploadBtn) return;

    dropZone.addEventListener("click", () => {
      fileInput.click();
    });

    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      if (e.dataTransfer.files.length > 0) {
        handlePDFUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        handlePDFUpload(e.target.files[0]);
        fileInput.value = ""; // reset
      }
    });

    reuploadBtn.addEventListener("click", () => {
      const fileInputTemp = document.createElement("input");
      fileInputTemp.type = "file";
      fileInputTemp.accept = "application/pdf";
      fileInputTemp.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];
          const cases = window.LegiumDB.get("cases", []);
          const c = cases.find(item => item.id === activeCaseId);
          if (c) {
            const activeDocId = reuploadBtn.getAttribute("data-doc-id");
            const docObj = c.documents.find(d => d.id === activeDocId);
            if (docObj) {
              const objUrl = URL.createObjectURL(file);
              pdfSessionUrls.set(activeDocId, objUrl);
              
              const currentUser = window.LegiumDB.getCurrentUser();
              window.LegiumDB.addLog(currentUser.id, `Recargado archivo físico para PDF '${docObj.name}' en caso ${activeCaseId}`, "Success");
              showToast("Archivo Cargado", `El archivo físico '${file.name}' ha sido recargado para la visualización.`, "success");
              
              const iframe = document.getElementById("pdf-viewer-iframe");
              const fallback = document.getElementById("pdf-viewer-fallback");
              iframe.src = objUrl;
              iframe.style.display = "block";
              fallback.style.display = "none";
              
              viewCaseDetail(activeCaseId);
            }
          }
        }
      });
      fileInputTemp.click();
    });
  }

  function renderClientsList() {
    const clients = window.LegiumDB.get("clients", []);
    clientsTableBody.innerHTML = "";

    if (clients.length === 0) {
      clientsTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No hay clientes registrados en el despacho.</td></tr>`;
      return;
    }

    clients.forEach(cli => {
      const row = document.createElement("tr");
      row.style.cursor = "pointer";
      row.innerHTML = `
        <td style="font-weight: 600; color: var(--text-primary);">${cli.name}</td>
        <td><span class="badge ${cli.type === 'Corporativo' ? 'badge-appealing' : 'badge-active'}">${cli.type}</span></td>
        <td><code>${cli.rfc}</code></td>
        <td>${cli.contactPerson || "N/A"}</td>
        <td><a href="mailto:${cli.email}">${cli.email}</a></td>
        <td>${cli.phone}</td>
      `;
      row.addEventListener("click", () => {
        viewClientDetail(cli.id);
      });
      clientsTableBody.appendChild(row);
    });
  }

  function viewClientDetail(clientId) {
    const clients = window.LegiumDB.get("clients", []);
    const cli = clients.find(item => item.id === clientId);

    if (!cli) {
      showToast("Error", "No se encontró el cliente solicitado.", "danger");
      return;
    }

    // Toggle panels
    document.getElementById("clients-list-panel").style.display = "none";
    document.getElementById("client-detail-panel").style.display = "block";

    // Bind fields
    document.getElementById("detail-client-id").innerText = cli.id;
    document.getElementById("detail-client-name").innerText = cli.name;
    document.getElementById("detail-client-rfc").innerText = cli.rfc;
    document.getElementById("detail-client-contact").innerText = cli.contactPerson || "N/A";
    document.getElementById("detail-client-phone").innerText = cli.phone;
    document.getElementById("detail-client-email").innerText = cli.email;

    const badgeType = document.getElementById("detail-client-badge-type");
    badgeType.className = `badge ${cli.type === 'Corporativo' ? 'badge-appealing' : 'badge-active'}`;
    badgeType.innerText = cli.type.toUpperCase();

    // Render associated cases
    const cases = window.LegiumDB.get("cases", []);
    const clientCases = cases.filter(c => c.clientId === clientId);

    const clientCasesTable = document.querySelector("#client-cases-table tbody");
    clientCasesTable.innerHTML = "";

    if (clientCases.length === 0) {
      clientCasesTable.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 10px;">No hay expedientes registrados para este cliente.</td></tr>`;
    } else {
      clientCases.forEach(c => {
        const row = document.createElement("tr");
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          viewCaseDetail(c.id);
        });
        
        let badgeClass = "badge-active";
        if (c.status === "Cerrado") badgeClass = "badge-closed";
        else if (c.status === "En Apelación") badgeClass = "badge-appealing";
        else if (c.status === "Suspendido") badgeClass = "badge-suspended";

        row.innerHTML = `
          <td style="color: var(--primary-gold); font-weight: 600;">${c.id}</td>
          <td style="font-weight: 600;">${c.title}</td>
          <td>${c.practiceArea}</td>
          <td><span class="badge ${badgeClass}">${c.status}</span></td>
        `;
        clientCasesTable.appendChild(row);
      });
    }

    // Render aggregated documents
    const clientDocContainer = document.getElementById("detail-client-documents");
    clientDocContainer.innerHTML = "";

    let aggregatedDocs = [];
    clientCases.forEach(c => {
      if (c.documents) {
        c.documents.forEach(doc => {
          aggregatedDocs.push({
            ...doc,
            caseId: c.id,
            caseTitle: c.title
          });
        });
      }
    });

    if (aggregatedDocs.length === 0) {
      clientDocContainer.innerHTML = `<p style="color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px;">No hay documentos PDF cargados para los expedientes de este cliente.</p>`;
    } else {
      aggregatedDocs.forEach(doc => {
        const item = document.createElement("div");
        item.className = "document-item";
        item.innerHTML = `
          <div class="doc-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2.2" fill="none"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div class="doc-info">
            <div class="doc-name" title="${doc.name}">${doc.name}</div>
            <div class="doc-meta">${doc.size} • ${doc.uploadDate} <br> <span class="metric-sub" style="font-size: 9.5px; color: var(--primary-gold); font-weight: 500;">Expediente: ${doc.caseId}</span></div>
          </div>
          <div class="doc-actions">
            <button class="btn btn-secondary btn-sm btn-view-doc" data-id="${doc.id}">Visualizar</button>
          </div>
        `;

        item.querySelector(".btn-view-doc").addEventListener("click", () => {
          openPDFViewer(doc.id, doc.name);
        });

        clientDocContainer.appendChild(item);
      });
    }
  }

  function renderReportsTable() {
    const cases = window.LegiumDB.get("cases", []);
    const users = window.LegiumDB.get("users", []).filter(u => u.role !== "TI Administrador");
    const financials = window.LegiumDB.get("financials", {});

    reportsLawyersTableBody.innerHTML = "";

    users.forEach(u => {
      const assignedCasesCount = cases.filter(c => c.assignedLawyerId === u.id).length;
      
      // Compute mock hours and fees billed
      let hours = 0;
      let revenue = 0;
      
      if (u.role === "Socio Principal") {
        hours = 92;
        revenue = 14800000;
      } else if (u.role === "Abogado Senior") {
        hours = 64;
        revenue = 6500000;
      } else if (u.role === "Abogado Junior") {
        hours = 28;
        revenue = 3200000;
      }

      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="font-weight: 600;">${u.name}</td>
        <td style="color: var(--primary-gold); font-weight: 500;">${u.role}</td>
        <td>${assignedCasesCount} expedientes</td>
        <td>${hours} hrs facturadas</td>
        <td style="font-weight: 600; color: var(--success);">$${revenue.toLocaleString()} CLP</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 100px; height: 6px; background-color: var(--border-color); border-radius: 3px; overflow: hidden;">
              <div style="width: ${u.role === "Abogado Junior" ? '75%' : '90%'}; height: 100%; background: linear-gradient(90deg, var(--primary-gold), var(--success));"></div>
            </div>
            <span style="font-size: 11px; font-weight: 600;">${u.role === "Abogado Junior" ? '75%' : '90%'}</span>
          </div>
        </td>
      `;
      reportsLawyersTableBody.appendChild(row);
    });
  }

  function renderITAdminSection() {
    const users = window.LegiumDB.get("users", []);
    const logs = window.LegiumDB.get("logs", []);

    // Render User Accounts Controls
    itUsersTableBody.innerHTML = "";
    users.forEach(u => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="avatar" style="width: 32px; height: 32px; font-size: 11px;">${u.avatar}</div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-weight: 600;">${u.name}</span>
              <span style="font-size: 10.5px; color: var(--text-muted);">${u.email}</span>
            </div>
          </div>
        </td>
        <td>
          <select class="filter-select select-user-role" data-id="${u.id}" style="min-width: 140px; font-size: 12px; padding: 4px 8px; padding-right: 24px; background-position: right 6px center; background-color: rgba(118, 118, 128, 0.08);">
            <option value="TI Administrador" ${u.role === 'TI Administrador' ? 'selected' : ''}>TI Administrador</option>
            <option value="Socio Principal" ${u.role === 'Socio Principal' ? 'selected' : ''}>Socio Principal</option>
            <option value="Abogado Senior" ${u.role === 'Abogado Senior' ? 'selected' : ''}>Abogado Senior</option>
            <option value="Abogado Junior" ${u.role === 'Abogado Junior' ? 'selected' : ''}>Abogado Junior</option>
          </select>
        </td>
        <td>
          <label class="switch-container">
            <input type="checkbox" class="switch-input select-user-active" data-id="${u.id}" ${u.active ? "checked" : ""}>
            <div class="switch-slider"></div>
          </label>
        </td>
      `;

      // Handle user active toggling
      row.querySelector(".select-user-active").addEventListener("change", (e) => {
        toggleUserActiveStatus(u.id, e.target.checked);
      });

      // Handle user role changing
      row.querySelector(".select-user-role").addEventListener("change", (e) => {
        updateUserRole(u.id, e.target.value);
      });

      itUsersTableBody.appendChild(row);
    });

    // Render Full Realtime Logs
    itLogsContainer.innerHTML = "";
    if (logs.length === 0) {
      itLogsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">No hay registros de auditoría.</div>`;
      return;
    }

    logs.forEach(l => {
      const item = document.createElement("div");
      item.className = "audit-log-item";
      item.innerHTML = `
        <div class="audit-log-status ${l.status.toLowerCase()}"></div>
        <div class="audit-log-details">
          <div class="audit-log-text"><strong>${l.userName}</strong> (${l.userRole}): ${l.action}</div>
          <div class="audit-log-meta">
            <span class="audit-log-time">${l.timestamp}</span>
            <span>•</span>
            <span style="color: ${l.status === 'Denied' ? 'var(--danger)' : l.status === 'Warning' ? 'var(--warning)' : 'var(--success)'};">${l.status}</span>
          </div>
        </div>
      `;
      itLogsContainer.appendChild(item);
    });
  }

  // --- ACTIONS & TOOTGLES ---
  function toggleTaskStatus(caseId, taskId) {
    const cases = window.LegiumDB.get("cases", []);
    const c = cases.find(item => item.id === caseId);
    
    if (c) {
      const task = c.tasks.find(t => t.id === taskId);
      if (task) {
        task.completed = !task.completed;
        window.LegiumDB.set("cases", cases);
        
        const currentUser = window.LegiumDB.getCurrentUser();
        window.LegiumDB.addLog(
          currentUser.id, 
          `Tarea '${task.title}' en caso ${caseId} marcada como ${task.completed ? 'Completada' : 'Pendiente'}`, 
          "Success"
        );
        
        showToast(
          "Tarea Actualizada", 
          `La tarea fue marcada como ${task.completed ? 'completada' : 'pendiente'}.`, 
          "success"
        );
        
        // Refresh active views
        renderAll();
        if (caseDetailPanel.style.display === "block" && activeCaseId === caseId) {
          viewCaseDetail(caseId);
        }
      }
    }
  }

  function toggleMilestoneStatus(caseId, milestoneIdx, completed) {
    const cases = window.LegiumDB.get("cases", []);
    const c = cases.find(item => item.id === caseId);

    if (c && c.timeline[milestoneIdx]) {
      const m = c.timeline[milestoneIdx];
      m.completed = completed;
      window.LegiumDB.set("cases", cases);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(
        currentUser.id,
        `Hito procesal '${m.title}' en caso ${caseId} marcado como ${completed ? 'Concluido' : 'Pendiente'}`,
        "Success"
      );

      showToast("Hito Actualizado", `El hito procesal fue marcado como ${completed ? 'realizado' : 'pendiente'}.`, "success");
      
      renderAll();
      if (caseDetailPanel.style.display === "block" && activeCaseId === caseId) {
        viewCaseDetail(caseId);
      }
    }
  }

  function toggleUserActiveStatus(userId, active) {
    const users = window.LegiumDB.get("users", []);
    const user = users.find(u => u.id === userId);

    if (user) {
      user.active = active;
      window.LegiumDB.set("users", users);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(
        currentUser.id,
        `Estado de cuenta del usuario ${user.name} modificado a: ${active ? 'Activo' : 'Inactivo'}`,
        active ? "Success" : "Warning"
      );

      showToast(
        "Usuario Modificado",
        `La cuenta de ${user.name} ha sido ${active ? 'activada' : 'desactivada'} con éxito.`,
        active ? "success" : "warning"
      );

      renderAll();
    }
  }

  function updateUserRole(userId, newRole) {
    const users = window.LegiumDB.get("users", []);
    const user = users.find(u => u.id === userId);

    if (user) {
      const oldRole = user.role;
      user.role = newRole;
      window.LegiumDB.set("users", users);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(
        currentUser.id,
        `Permisos del usuario ${user.name} modificados de '${oldRole}' a '${newRole}'`,
        "Success"
      );

      showToast("Permisos Actualizados", `El rol de ${user.name} ahora es ${newRole}.`, "success");

      // If the modified user is the active user simulator, update simulator state
      if (currentUser.id === userId) {
        window.LegiumDB.setCurrentUser(user);
        // Sync simulator dropdown
        const simulatorSelect = document.getElementById("simulator-role-select");
        if (simulatorSelect) {
          simulatorSelect.value = userId;
        }
        applyRolePermissions(user);
      }

      renderAll();
    }
  }

  // --- FORM UTILS ---
  function populateFormSelects() {
    const clients = window.LegiumDB.get("clients", []);
    const lawyers = window.LegiumDB.get("users", []).filter(u => u.role !== "TI Administrador" && u.active);
    
    // Populate Client Select for case creation
    const caseClientSelect = document.getElementById("case-client-select");
    caseClientSelect.innerHTML = `<option value="" disabled selected>Seleccione un cliente...</option>`;
    clients.forEach(c => {
      caseClientSelect.innerHTML += `<option value="${c.id}">${c.name} (${c.type})</option>`;
    });

    // Populate Lawyer Select for case creation
    const caseLawyerSelect = document.getElementById("case-lawyer-select");
    caseLawyerSelect.innerHTML = `<option value="" disabled selected>Seleccione un abogado...</option>`;
    lawyers.forEach(l => {
      caseLawyerSelect.innerHTML += `<option value="${l.id}">${l.name} (${l.role})</option>`;
    });

    // Populate Lawyer Select for task creation
    const taskLawyerSelect = document.getElementById("task-lawyer-select");
    taskLawyerSelect.innerHTML = `<option value="" disabled selected>Seleccione un responsable...</option>`;
    lawyers.forEach(l => {
      taskLawyerSelect.innerHTML += `<option value="${l.id}">${l.name} (${l.role})</option>`;
    });
  }



  // --- SEARCH & FILTERS ---
  function setupSearchFilters() {
    searchInput.addEventListener("input", () => {
      // If we are in case list, filter cases, else if in clients list, filter clients
      if (activeTab === "cases" && casesListPanel.style.display === "block") {
        renderCasesList();
      } else if (activeTab === "clients") {
        renderClientsList();
      }
    });

    const areaSegments = document.querySelectorAll("#segmented-filter-area .segment-item");
    areaSegments.forEach(seg => {
      seg.addEventListener("click", () => {
        areaSegments.forEach(s => s.classList.remove("active"));
        seg.classList.add("active");
        currentFilterArea = seg.getAttribute("data-value");
        renderCasesList();
      });
    });

    const statusSegments = document.querySelectorAll("#segmented-filter-status .segment-item");
    statusSegments.forEach(seg => {
      seg.addEventListener("click", () => {
        statusSegments.forEach(s => s.classList.remove("active"));
        seg.classList.add("active");
        currentFilterStatus = seg.getAttribute("data-value");
        renderCasesList();
      });
    });
    
    // Detail view back button
    document.getElementById("btn-back-to-cases").addEventListener("click", () => {
      caseDetailPanel.style.display = "none";
      casesListPanel.style.display = "block";
      activeCaseId = null;
      renderCasesList();
    });

    // Client detail view back button
    document.getElementById("btn-back-to-clients").addEventListener("click", () => {
      document.getElementById("client-detail-panel").style.display = "none";
      document.getElementById("clients-list-panel").style.display = "block";
      renderClientsList();
    });
  }

  // --- MODALS SYSTEM ---
  function setupModals() {
    // Open create case
    modalOpenCreateCase.addEventListener("click", () => {
      openModal("modal-create-case");
    });

    // Open create client
    modalOpenCreateClient.addEventListener("click", () => {
      openModal("modal-create-client");
    });

    // Open create user
    if (modalOpenCreateUser) {
      modalOpenCreateUser.addEventListener("click", () => {
        openModal("modal-create-user");
      });
    }

    // Open milestone creation in case detail
    btnAddMilestone.addEventListener("click", () => {
      // Set default date to today
      const today = new Date().toISOString().split('T')[0];
      document.getElementById("milestone-date-input").value = today;
      openModal("modal-create-milestone");
    });

    // Open task creation in case detail
    btnAddTask.addEventListener("click", () => {
      const today = new Date().toISOString().split('T')[0];
      document.getElementById("task-date-input").value = today;
      openModal("modal-create-task");
    });

    // Close buttons
    modalCloseButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const modalId = btn.getAttribute("data-close");
        closeModal(modalId);
      });
    });

    // Close modal on background click
    window.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        closeModal(e.target.id);
      }
    });
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add("active");
    }
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.remove("active");
      // Clean forms on close
      const form = modal.querySelector("form");
      if (form) form.reset();
      // Reset iframe if it's the PDF modal to prevent background loading
      if (id === "modal-view-pdf") {
        const iframe = document.getElementById("pdf-viewer-iframe");
        if (iframe) iframe.src = "";
      }
    }
  }

  // --- FORMS SUBMISSIONS ---
  function setupForms() {
    // Create Case Form
    formCreateCase.addEventListener("submit", (e) => {
      e.preventDefault();
      const cases = window.LegiumDB.get("cases", []);
      const clients = window.LegiumDB.get("clients", []);
      const users = window.LegiumDB.get("users", []);

      const title = document.getElementById("case-title-input").value;
      const clientId = document.getElementById("case-client-select").value;
      const practiceArea = document.getElementById("case-area-select").value;
      const opposingParty = document.getElementById("case-opposing-input").value;
      const opposingLawyer = document.getElementById("case-opposing-lawyer-input").value;
      const court = document.getElementById("case-court-input").value;
      const judge = document.getElementById("case-judge-input").value;
      const assignedLawyerId = document.getElementById("case-lawyer-select").value;
      const startDate = document.getElementById("case-start-date-input").value;
      const description = document.getElementById("case-desc-input").value;

      const client = clients.find(cl => cl.id === clientId);
      const lawyer = users.find(u => u.id === assignedLawyerId);

      // Generate a new code ID (LEG-2026-XXX)
      const count = cases.length + 1;
      const newId = `LEG-2026-${String(count).padStart(3, '0')}`;

      const newCase = {
        id: newId,
        title,
        clientId,
        clientName: client ? client.name : "Cliente Desconocido",
        opposingParty,
        opposingLawyer,
        practiceArea,
        status: "Activo",
        court,
        judge,
        assignedLawyerId,
        assignedLawyerName: lawyer ? lawyer.name : "Abogado Sin Asignar",
        startDate,
        description,
        timeline: [
          { date: startDate, title: "Apertura de Expediente", desc: "Se crea el archivo digital del caso en Legium.", completed: true }
        ],
        tasks: [],
        notes: [],
        documents: []
      };

      cases.push(newCase);
      window.LegiumDB.set("cases", cases);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(currentUser.id, `Creación de nuevo expediente jurídico ${newId}: ${title}`, "Success");

      showToast("Expediente Creado", `El caso ${newId} ha sido registrado correctamente.`, "success");
      closeModal("modal-create-case");
      renderAll();
    });

    // Create Client Form
    formCreateClient.addEventListener("submit", (e) => {
      e.preventDefault();
      const clients = window.LegiumDB.get("clients", []);
      
      const name = document.getElementById("client-name-input").value;
      const type = document.getElementById("client-type-select").value;
      const rfc = document.getElementById("client-rfc-input").value;
      const contactPerson = document.getElementById("client-contact-input").value;
      const phone = document.getElementById("client-phone-input").value;
      const email = document.getElementById("client-email-input").value;

      // Generate client ID
      const count = clients.length + 1;
      const newId = `cli-${String(count).padStart(2, '0')}`;

      const newClient = {
        id: newId,
        name,
        type,
        rfc,
        contactPerson,
        phone,
        email
      };

      clients.push(newClient);
      window.LegiumDB.set("clients", clients);

      const currentUser = window.LegiumDB.getCurrentUser();
      window.LegiumDB.addLog(currentUser.id, `Registro de nuevo cliente ${name} (${type})`, "Success");

      showToast("Cliente Registrado", `El cliente ${name} fue añadido al directorio.`, "success");
      closeModal("modal-create-client");
      renderAll();
    });

    // Create Milestone Form
    formCreateMilestone.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!activeCaseId) return;

      const cases = window.LegiumDB.get("cases", []);
      const c = cases.find(item => item.id === activeCaseId);

      if (c) {
        const date = document.getElementById("milestone-date-input").value;
        const title = document.getElementById("milestone-title-input").value;
        const desc = document.getElementById("milestone-desc-input").value;
        const completed = document.getElementById("milestone-completed-select").value === "true";

        c.timeline.push({ date, title, desc, completed });
        window.LegiumDB.set("cases", cases);

        const currentUser = window.LegiumDB.getCurrentUser();
        window.LegiumDB.addLog(currentUser.id, `Hito procesal '${title}' registrado en caso ${activeCaseId}`, "Success");

        showToast("Hito Registrado", `El hito fue añadido a la línea de tiempo.`, "success");
        closeModal("modal-create-milestone");
        renderAll();
        viewCaseDetail(activeCaseId);
      }
    });

    // Create Task Form
    formCreateTask.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!activeCaseId) return;

      const cases = window.LegiumDB.get("cases", []);
      const c = cases.find(item => item.id === activeCaseId);

      if (c) {
        const title = document.getElementById("task-title-input").value;
        const assignedTo = document.getElementById("task-lawyer-select").value;
        const dueDate = document.getElementById("task-date-input").value;

        // Generate ID
        let maxId = 0;
        cases.forEach(cs => cs.tasks.forEach(t => {
          const idNum = parseInt(t.id.replace("tsk-", ""));
          if (idNum > maxId) maxId = idNum;
        }));
        const newTaskId = `tsk-${String(maxId + 1).padStart(3, '0')}`;

        c.tasks.push({
          id: newTaskId,
          title,
          dueDate,
          assignedTo,
          completed: false
        });
        window.LegiumDB.set("cases", cases);

        const currentUser = window.LegiumDB.getCurrentUser();
        window.LegiumDB.addLog(currentUser.id, `Nueva tarea '${title}' añadida en caso ${activeCaseId}`, "Success");

        showToast("Tarea Creada", `La tarea fue asignada correctamente.`, "success");
        closeModal("modal-create-task");
        renderAll();
        viewCaseDetail(activeCaseId);
      }
    });

    // Save Note Button
    document.getElementById("btn-save-note").addEventListener("click", () => {
      const text = noteInput.value.trim();
      if (!text || !activeCaseId) return;

      const cases = window.LegiumDB.get("cases", []);
      const c = cases.find(item => item.id === activeCaseId);

      if (c) {
        const currentUser = window.LegiumDB.getCurrentUser();
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const formattedDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        // Create Note ID
        const noteId = `nt-${String(c.notes.length + 1).padStart(3, '0')}`;

        c.notes.push({
          id: noteId,
          date: formattedDate,
          author: currentUser.name,
          text
        });

        window.LegiumDB.set("cases", cases);
        window.LegiumDB.addLog(currentUser.id, `Añadida nota de abogado en expediente ${activeCaseId}`, "Success");

        showToast("Nota Guardada", "La nota interna ha sido registrada de manera confidencial.", "success");
        noteInput.value = "";
        
        viewCaseDetail(activeCaseId);
      }
    });

    // Create User Form
    if (formCreateUser) {
      formCreateUser.addEventListener("submit", (e) => {
        e.preventDefault();
        const users = window.LegiumDB.get("users", []);

        const name = document.getElementById("user-name-input").value.trim();
        const email = document.getElementById("user-email-input").value.trim();
        const role = document.getElementById("user-role-select").value;

        // Generate avatar initials (e.g. Dra. Valentina Paz -> VP)
        const cleanName = name.replace(/^(Dr\.|Dra\.|Lic\.|Ing\.)\s+/i, "");
        const initials = cleanName.split(/\s+/).map(n => n[0]).join("").toUpperCase().slice(0, 2);

        // Generate user ID
        const count = users.length + 1;
        const newId = `usr-${String(count).padStart(2, '0')}`;

        const newUser = {
          id: newId,
          name,
          email,
          role,
          active: true,
          avatar: initials || "US"
        };

        users.push(newUser);
        window.LegiumDB.set("users", users);

        const currentUser = window.LegiumDB.getCurrentUser();
        window.LegiumDB.addLog(currentUser.id, `Usuario creado: ${name} con rol ${role}`, "Success");

        showToast("Usuario Creado", `La cuenta de ${name} ha sido registrada.`, "success");
        closeModal("modal-create-user");
        renderAll();
      });
    }
  }



  // --- TI ADMIN ACTIONS ---
  function setupITControls() {
    // Force Backup
    document.getElementById("btn-it-backup").addEventListener("click", () => {
      const currentUser = window.LegiumDB.getCurrentUser();
      
      healthBackupStatus.innerText = "RESPALDANDO...";
      healthBackupStatus.parentElement.querySelector(".health-indicator").classList.add("pulsing");
      
      setTimeout(() => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const formattedTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        
        healthBackupStatus.innerText = `RESPALDO EXITOSO (${formattedTime})`;
        healthBackupStatus.parentElement.querySelector(".health-indicator").classList.remove("pulsing");
        
        window.LegiumDB.addLog(currentUser.id, "Copia de seguridad forzada del sistema completada (Backup Manual S3)", "Success");
        showToast("Backup Exitoso", "Respaldo completo de la base de datos subido a AWS S3 correctamente.", "success");
        renderAll();
      }, 1500);
    });

    // Simulate high latency
    let highLatencyActive = false;
    document.getElementById("btn-it-latency").addEventListener("click", () => {
      const currentUser = window.LegiumDB.getCurrentUser();
      highLatencyActive = !highLatencyActive;

      if (highLatencyActive) {
        healthLatencyValue.innerText = "480 ms";
        healthLatencyIndicator.style.backgroundColor = "var(--danger)";
        healthLatencyIndicator.style.boxShadow = "0 0 8px var(--danger)";
        
        window.LegiumDB.addLog(currentUser.id, "Simulación de alta latencia de red ACTIVADA por el administrador", "Warning");
        showToast("Advertencia de Sistema", "Simulación de cuello de botella de red activada (latencia > 450ms).", "warning");
      } else {
        healthLatencyValue.innerText = "12 ms";
        healthLatencyIndicator.style.backgroundColor = "var(--success)";
        healthLatencyIndicator.style.boxShadow = "0 0 8px var(--success)";
        
        window.LegiumDB.addLog(currentUser.id, "Simulación de alta latencia de red DESACTIVADA por el administrador", "Success");
        showToast("Sistema Optimizado", "Latencia de API reestablecida a valores normales (12ms).", "success");
      }
      renderAll();
    });

    // Full Factory Reset
    document.getElementById("btn-it-reset").addEventListener("click", () => {
      if (confirm("🚨 ¿ATENCIÓN! ¿Está seguro de restablecer por completo la base de datos a los valores iniciales de fábrica? Todos los expedientes y clientes nuevos se borrarán permanéntemente.")) {
        window.LegiumDB.reset();
        showToast("Sistema Restablecido", "La base de datos se ha formateado y reestablecido con éxito.", "danger");
        
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    });
  }


  // --- RUN ---
  init();
});
