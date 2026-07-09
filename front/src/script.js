// --- BASE DE DATOS LOCALES DINÁMICAS (CARGADAS DESDE JSON) ---
let municipioResources = {};
let estatalNLResources = [];
let nationalResources = [];
let flowLengths = {};
let questions = {};
let violenceTypeInfo = {};

// --- VARIABLES DE ESTADO ---
let currentQuestionId = "age";
let currentStep = 0;
let totalSteps = 0;
let scores = { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0, intimidacion: 0 };
let answerHistory = []; // Para dar soporte a "Anterior"
let selectedMunicipio = "";

// --- MANEJO DE HISTORIAL EN LOCALSTORAGE (MÁX 15 MINUTOS) ---
const SESSION_KEY = "refleja_session";
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutos

function saveSession() {
    try {
        const session = {
            timestamp: Date.now(),
            currentQuestionId,
            currentStep,
            totalSteps,
            scores,
            answerHistory,
            selectedMunicipio
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
        console.error("Error al guardar sesión en localStorage:", e);
    }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
    } catch (e) {
        console.error("Error al limpiar sesión en localStorage:", e);
    }
}

function restoreSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return false;

        const session = JSON.parse(raw);
        const elapsed = Date.now() - session.timestamp;

        if (elapsed > SESSION_TIMEOUT_MS) {
            clearSession();
            return false;
        }

        // Restaurar estado
        currentQuestionId = session.currentQuestionId;
        currentStep = session.currentStep;
        totalSteps = session.totalSteps;
        scores = session.scores || { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0, intimidacion: 0 };
        answerHistory = session.answerHistory || [];
        selectedMunicipio = session.selectedMunicipio || "";
        
        return true;
    } catch (e) {
        console.error("Error al restaurar sesión de localStorage:", e);
        clearSession();
        return false;
    }
}


// --- SELECCIÓN DE ELEMENTOS DOM ---
const mainContent = document.getElementById("main-content");
const disguisedSite = document.getElementById("disguised-site");
const topIsland = document.getElementById("top-control-island");

// Botones de la isla superior
const urgentHelpBtn = document.getElementById("urgent-help-btn");
const hideSiteBtn = document.getElementById("hide-site-btn");
const restoreSiteTrigger = document.getElementById("restore-site-trigger");
const headerLogo = document.getElementById("header-logo");

// Etapas
const stages = {
    intro: document.getElementById("intro-stage"),
    test: document.getElementById("test-stage"),
    location: document.getElementById("location-stage"),
    result: document.getElementById("result-stage"),
    minor: document.getElementById("minor-stage"),
    urgentLocation: document.getElementById("urgent-location-stage"),
    urgentResult: document.getElementById("urgent-result-stage"),
    resourcesSection: document.getElementById("resources-section")
};

// Elementos de la etapa de test
const progressLabel = document.getElementById("progress-label");
const progressPercent = document.getElementById("progress-percent");
const progressBar = document.getElementById("progress-bar");
const testTitle = document.getElementById("test-title");
const answerGrid = document.getElementById("answer-grid");
const previousBtn = document.getElementById("previous-question");

// Elementos de la caja de explicación
const explanationBox = document.getElementById("explanation-box");
const explanationText = document.getElementById("explanation-text");
const explanationSource = document.getElementById("explanation-source");

// Formularios de ubicación
const locationForm = document.getElementById("location-form");
const municipioSelect = document.getElementById("municipio-select");
const urgentLocationForm = document.getElementById("urgent-location-form");
const urgentMunicipioSelect = document.getElementById("urgent-municipio-select");

// --- ENRUTADOR DE PANTALLAS (SHOW/HIDE) ---
function showStage(stageKey, skipScroll = false) {
    // Asignar clase de la etapa activa al body para animar fondos
    document.body.className = `stage-${stageKey}`;

    // Ocultar todos los stages
    Object.values(stages).forEach(stage => {
        if (stage) stage.classList.add("is-hidden");
    });
    
    // Mostrar el stage solicitado
    const activeStage = stages[stageKey];
    if (activeStage) {
        activeStage.classList.remove("is-hidden");
        
        // Scroll suave al inicio de la tarjeta activa tomando en cuenta la isla superior
        if (!skipScroll) {
            setTimeout(() => {
                const yOffset = -100;
                const yTarget = activeStage.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: Math.max(0, yTarget), behavior: 'smooth' });
            }, 50);
        }

        // Gestión de foco accesible automatizada
        setTimeout(() => {
            if (stageKey === "intro") {
                const startBtn = document.getElementById("start-test");
                if (startBtn) startBtn.focus({ preventScroll: true });
            } else if (stageKey === "location") {
                const munSelect = document.getElementById("municipio-select");
                if (munSelect) munSelect.focus({ preventScroll: true });
            } else if (stageKey === "urgentLocation") {
                const urgentSelect = document.getElementById("urgent-municipio-select");
                if (urgentSelect) urgentSelect.focus({ preventScroll: true });
            } else if (stageKey === "result") {
                const restartBtn = document.getElementById("restart-test");
                if (restartBtn) restartBtn.focus({ preventScroll: true });
            } else if (stageKey === "urgentResult") {
                const closeBtn = document.getElementById("close-urgent-results");
                if (closeBtn) closeBtn.focus({ preventScroll: true });
            } else if (stageKey === "minor") {
                const restartMinor = document.getElementById("restart-minor");
                if (restartMinor) restartMinor.focus({ preventScroll: true });
            }
        }, 100);
    }
}

// --- RESET DEL ESTADO COMPLETO ---
function resetTest(skipScroll = false) {
    clearSession();
    if (window.ReflejaStats) ReflejaStats.reset();
    currentQuestionId = "age";
    currentStep = 0;
    totalSteps = 0;
    scores = { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0, intimidacion: 0 };
    answerHistory = [];
    selectedMunicipio = "";
    
    if (municipioSelect) {
        municipioSelect.value = "";
        municipioSelect.dispatchEvent(new Event("change"));
    }
    if (urgentMunicipioSelect) {
        urgentMunicipioSelect.value = "";
        urgentMunicipioSelect.dispatchEvent(new Event("change"));
    }
    
    document.body.style.setProperty('--quiz-pct', 0);
    document.body.style.setProperty('--quiz-score', 0);
    
    showStage("intro", skipScroll);
}

// --- RENDERIZADO DE LAS PREGUNTAS ---
function renderQuestion() {
    const q = questions[currentQuestionId];
    if (!q) return;

    // Actualizar Título
    testTitle.textContent = q.text;

    // Actualizar Caja de Explicación
    if (q.explanation) {
        explanationText.textContent = q.explanation;
        explanationSource.textContent = q.source || "Secretaría de las Mujeres (N.L.)";
        explanationBox.classList.remove("is-hidden");
    } else {
        explanationBox.classList.add("is-hidden");
    }

    // Actualizar Barra de Progreso e Indicadores
    if (totalSteps > 0 && currentStep > 0) {
        const pct = Math.round((currentStep / totalSteps) * 100);
        progressLabel.textContent = `${String(currentStep).padStart(2, '0')} / ${String(totalSteps).padStart(2, '0')}`;
        progressPercent.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
        document.body.style.setProperty('--quiz-pct', pct);
    } else {
        progressLabel.textContent = "Configuración";
        progressPercent.textContent = "0%";
        progressBar.style.width = "0%";
        document.body.style.setProperty('--quiz-pct', 0);
    }

    const currentScore = Object.values(scores).reduce((a, b) => a + b, 0);
    document.body.style.setProperty('--quiz-score', currentScore);

    // Mostrar/ocultar botón Anterior
    if (answerHistory.length > 0) {
        previousBtn.classList.remove("is-hidden");
    } else {
        previousBtn.classList.add("is-hidden");
    }

    // Limpiar y Generar Botones de Respuesta de forma Dinámica
    answerGrid.innerHTML = "";
    q.options.forEach((opt, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "answer-card";
        
        // Asignar colores temáticos suaves basados en el nivel de severidad de los puntajes
        let maxScore = 0;
        if (opt.scores) {
            const values = Object.values(opt.scores);
            if (values.length > 0) {
                maxScore = Math.max(...values);
            }
        }

        // Estilizar botón basándose en el tipo de respuesta (o puntaje de riesgo)
        if (currentQuestionId === 'age' || currentQuestionId === 'start') {
            button.classList.add("answer-card--neutral");
        } else if (maxScore >= 2) {
            button.style.background = "oklch(0.96 0.025 20 / 60%)";
            button.style.borderColor = "oklch(0.91 0.03 20)";
            button.style.color = "oklch(0.25 0.05 20)";
        } else if (maxScore === 1) {
            button.style.background = "oklch(0.97 0.025 75 / 60%)";
            button.style.borderColor = "oklch(0.92 0.03 75)";
            button.style.color = "oklch(0.28 0.05 75)";
        } else {
            button.style.background = "oklch(0.97 0.015 140 / 60%)";
            button.style.borderColor = "oklch(0.92 0.02 140)";
            button.style.color = "oklch(0.25 0.04 140)";
        }

        // Estructura interna del botón
        button.innerHTML = `<span>${opt.label}</span>`;
        
        // Evento click para avanzar
        button.addEventListener("click", () => handleAnswerSelect(opt));
        answerGrid.appendChild(button);
    });

    // Desplazar la pantalla suavemente hacia la tarjeta de la pregunta
    const yOffset = -100; // Espacio para evitar que la isla de control superior cubra la tarjeta
    const yTarget = stages.test.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: yTarget, behavior: 'smooth' });

    // Enfocar automáticamente la primera opción para facilitar navegación con teclado (Enter/Espacio)
    setTimeout(() => {
        const firstBtn = answerGrid.querySelector(".answer-card");
        if (firstBtn) {
            firstBtn.focus();
        }
    }, 100);
}

function handleAnswerSelect(option) {
    const answeredId = currentQuestionId;
    // Registrar paso actual en el historial para permitir regresar
    answerHistory.push({
        questionId: currentQuestionId,
        step: currentStep,
        totalSteps: totalSteps,
        scores: { ...scores }
    });

    // Sumar puntajes si existen
    if (option.scores) {
        for (const key in option.scores) {
            scores[key] = (scores[key] || 0) + option.scores[key];
        }
    }

    const nextId = option.nextId;

    // --- Emitir evento estadístico anónimo de esta respuesta ---
    if (window.ReflejaStats) {
        let flowType = null;
        if (answeredId.indexOf("pareja") === 0) flowType = "pareja";
        else if (answeredId.indexOf("fam") === 0) flowType = "fam";
        else if (answeredId.indexOf("trab") === 0) flowType = "trab";
        else if (answeredId === "start") {
            flowType = nextId.indexOf("fam") === 0 ? "fam"
                : nextId.indexOf("trab") === 0 ? "trab" : "pareja";
        }
        let ageBucket = null;
        if (answeredId === "age") {
            const lbl = option.label || "";
            if (/Menos de 18/.test(lbl)) ageBucket = "minor";
            else if (/18 a 25/.test(lbl)) ageBucket = "18-25";
            else if (/26 a 40/.test(lbl)) ageBucket = "26-40";
            else if (/41/.test(lbl)) ageBucket = "41+";
        }
        const m = answeredId.match(/_(\d+)$/);
        const step = m ? parseInt(m[1], 10)
            : (answeredId === "age" || answeredId === "start") ? 1 : 0;
        // Se envía el qid ESTABLE de la pregunta (no la clave), para que las
        // estadísticas se mantengan bien definidas aunque el formulario cambie.
        const qQid = (questions[answeredId] && questions[answeredId].qid) || answeredId;
        const nQid = (questions[nextId] && questions[nextId].qid) || nextId;
        ReflejaStats.answer({ questionId: qQid, nextId: nQid, step: step, flowType: flowType, ageBucket: ageBucket });
        if (nextId === "MINOR") ReflejaStats.minor();
    }

    // Manejar enrutamientos especiales
    if (nextId === "MINOR") {
        currentQuestionId = "MINOR";
        saveSession();
        showStage("minor");
        return;
    }

    if (nextId === "LOCATION") {
        currentQuestionId = "LOCATION";
        saveSession();
        showStage("location");
        return;
    }

    // Configurar total de pasos al iniciar un flujo de relación
    if (currentQuestionId === "start") {
        let flow = "pareja";
        if (nextId.startsWith("fam")) flow = "fam";
        if (nextId.startsWith("trab")) flow = "trab";
        totalSteps = flowLengths[flow];
        currentStep = 1; // Reiniciar contador para el flujo de preguntas
    } else if (currentQuestionId !== "age") {
        // Para preguntas del flujo, incrementar el contador
        currentStep++;
    } else {
        // Para age, solo marcar paso 1
        currentStep = 1;
    }

    currentQuestionId = nextId;
    saveSession();
    renderQuestion();
}

// Retroceder un paso
previousBtn.addEventListener("click", () => {
    if (answerHistory.length === 0) return;
    
    const lastState = answerHistory.pop();
    currentQuestionId = lastState.questionId;
    currentStep = lastState.step;
    totalSteps = lastState.totalSteps;
    scores = { ...lastState.scores };
    
    saveSession();
    renderQuestion();
});

// --- UTILIDADES DE MUNICIPIOS ---
// Devuelve la lista de municipios ordenada alfabéticamente (ignorando acentos)
function getMuniList() {
    return Object.keys(municipioResources)
        .map(slug => ({
            slug,
            name: municipioResources[slug].name,
            hasMunicipal: Array.isArray(municipioResources[slug].resources) && municipioResources[slug].resources.length > 0
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));
}

// Obtiene los datos de un municipio de forma segura
function getMunData(code) {
    const d = municipioResources[code];
    if (d) return d;
    return { name: "Nuevo León", resources: [] };
}

// Rellena los dos selectores (formulario y ayuda urgente) con todos los municipios
function populateMunicipioSelects() {
    const list = getMuniList();
    [municipioSelect, urgentMunicipioSelect].forEach(select => {
        if (!select) return;
        // Conservar solo la opción placeholder inicial
        const placeholder = select.querySelector("option[value='']");
        select.innerHTML = "";
        if (placeholder) select.appendChild(placeholder);
        list.forEach(m => {
            const opt = document.createElement("option");
            opt.value = m.slug;
            opt.textContent = m.name;
            select.appendChild(opt);
        });
    });

    // Convertir a selectores buscables personalizados inteligentes
    convertSelectToSearchable(municipioSelect, "Selecciona tu municipio...");
    convertSelectToSearchable(urgentMunicipioSelect, "Selecciona tu municipio...");
}

// Convierte un elemento select nativo en un dropdown de autocompletado y búsqueda moderno y estilizado
function convertSelectToSearchable(select, placeholderText) {
    if (!select) return;
    
    // Ocultar el wrapper nativo (o el select si no tiene wrapper)
    const wrapper = select.parentElement;
    if (wrapper && wrapper.classList.contains("select-wrapper")) {
        wrapper.style.display = "none";
    } else {
        select.style.display = "none";
    }

    // Crear el contenedor personalizado
    const container = document.createElement("div");
    container.className = "custom-muni-select";
    container.id = `custom-${select.id}`;

    // Crear el botón disparador (trigger)
    const trigger = document.createElement("button");
    trigger.className = "custom-muni-select__trigger";
    trigger.type = "button";
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", `list-${select.id}`);
    trigger.innerHTML = `<span>${placeholderText}</span><span class="custom-muni-select__caret">▾</span>`;
    container.appendChild(trigger);

    // Crear el panel desplegable
    const panel = document.createElement("div");
    panel.className = "custom-muni-select__panel";
    panel.hidden = true;

    // Caja de búsqueda interna
    const searchWrap = document.createElement("div");
    searchWrap.className = "custom-muni-select__search-wrap";
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.className = "custom-muni-select__search";
    searchInput.placeholder = "Buscar tu municipio...";
    searchInput.autocomplete = "off";
    searchInput.setAttribute("aria-autocomplete", "list");
    searchInput.setAttribute("aria-controls", `list-${select.id}`);
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    // Lista de opciones filtrables
    const listEl = document.createElement("ul");
    listEl.className = "custom-muni-select__list";
    listEl.id = `list-${select.id}`;
    listEl.setAttribute("role", "listbox");
    panel.appendChild(listEl);

    container.appendChild(panel);

    // Insertar el componente en el DOM justo después del select nativo o su wrapper
    if (wrapper) {
        wrapper.parentNode.insertBefore(container, wrapper.nextSibling);
    } else {
        select.parentNode.insertBefore(container, select.nextSibling);
    }

    let highlightedIndex = -1;

    function updateHighlight() {
        const items = listEl.querySelectorAll(".custom-muni-select__item");
        items.forEach((item, index) => {
            if (index === highlightedIndex) {
                item.classList.add("custom-muni-select__item--active");
                item.setAttribute("aria-selected", "true");
                item.scrollIntoView({ block: "nearest" });
            } else {
                item.classList.remove("custom-muni-select__item--active");
                item.setAttribute("aria-selected", "false");
            }
        });

        if (highlightedIndex >= 0) {
            searchInput.setAttribute("aria-activedescendant", `opt-${select.id}-${highlightedIndex}`);
        } else {
            searchInput.removeAttribute("aria-activedescendant");
        }
    }

    // Función para renderizar los elementos filtrados
    function renderList(filter = "") {
        const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const q = norm(filter.trim());
        listEl.innerHTML = "";
        highlightedIndex = -1;

        const options = Array.from(select.options).filter(opt => opt.value !== "");
        const matches = options.filter(opt => !q || norm(opt.textContent).includes(q));

        if (matches.length === 0) {
            const emptyDiv = document.createElement("div");
            emptyDiv.className = "custom-muni-select__empty";
            emptyDiv.textContent = "No se encontró ese municipio.";
            listEl.appendChild(emptyDiv);
            updateHighlight();
            return;
        }

        matches.forEach((opt, idx) => {
            const li = document.createElement("li");
            li.setAttribute("role", "none");
            
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "custom-muni-select__item";
            btn.textContent = opt.textContent;
            btn.tabIndex = -1;
            btn.setAttribute("role", "option");
            btn.setAttribute("id", `opt-${select.id}-${idx}`);
            btn.setAttribute("aria-selected", "false");
            
            btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                select.value = opt.value;
                
                // Despachar el evento 'change' nativo para que se ejecuten los listeners de script.js
                select.dispatchEvent(new Event("change", { bubbles: true }));
                
                // Actualizar la etiqueta visible
                trigger.querySelector("span").textContent = opt.textContent;
                closePanel();
                trigger.focus();
            });
            li.appendChild(btn);
            listEl.appendChild(li);
        });

        updateHighlight();
    }

    function openPanel() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        searchInput.value = "";
        renderList();
        setTimeout(() => { searchInput.focus(); }, 40);
    }

    function closePanel() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        highlightedIndex = -1;
    }

    trigger.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panel.hidden) {
            // Cerrar otros paneles personalizados abiertos primero
            document.querySelectorAll(".custom-muni-select__panel").forEach(p => p.hidden = true);
            document.querySelectorAll(".custom-muni-select__trigger").forEach(t => t.setAttribute("aria-expanded", "false"));
            openPanel();
        } else {
            closePanel();
        }
    });

    trigger.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (panel.hidden) {
                openPanel();
            }
        }
    });

    searchInput.addEventListener("input", () => {
        renderList(searchInput.value);
    });

    searchInput.addEventListener("keydown", (e) => {
        const items = listEl.querySelectorAll(".custom-muni-select__item");
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (items.length > 0) {
                highlightedIndex = (highlightedIndex + 1) % items.length;
                updateHighlight();
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (items.length > 0) {
                if (highlightedIndex <= 0) {
                    highlightedIndex = -1;
                } else {
                    highlightedIndex = highlightedIndex - 1;
                }
                updateHighlight();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (highlightedIndex >= 0 && items[highlightedIndex]) {
                items[highlightedIndex].click();
            } else {
                const firstItem = listEl.querySelector(".custom-muni-select__item");
                if (firstItem) firstItem.click();
            }
        } else if (e.key === "Escape") {
            closePanel();
            trigger.focus();
        }
    });

    // Cerrar si el foco se mueve fuera del control completo
    container.addEventListener("focusout", (e) => {
        if (e.relatedTarget && !container.contains(e.relatedTarget)) {
            closePanel();
        }
    });

    // Cerrar al hacer clic fuera del control
    document.addEventListener("click", (e) => {
        if (!panel.hidden && !container.contains(e.target)) {
            closePanel();
        }
    });

    // Sincronizar el trigger cuando el select nativo cambie su valor programáticamente
    select.addEventListener("change", () => {
        if (select.value === "") {
            trigger.querySelector("span").textContent = placeholderText;
        } else {
            const activeOpt = Array.from(select.options).find(opt => opt.value === select.value);
            if (activeOpt) {
                trigger.querySelector("span").textContent = activeOpt.textContent;
            }
        }
    });
}

// Construye el menú desplegable buscable de municipios
function buildMuniMenu() {
    const menu = document.getElementById("muni-menu");
    const trigger = document.getElementById("muni-menu-trigger");
    const panel = document.getElementById("muni-menu-panel");
    const search = document.getElementById("muni-menu-search");
    const listEl = document.getElementById("muni-menu-list");
    if (!menu || !trigger || !panel || !search || !listEl) return;

    const list = getMuniList();

    function renderList(filter = "") {
        const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const q = norm(filter.trim());
        listEl.innerHTML = "";
        const matches = list.filter(m => !q || norm(m.name).includes(q));
        if (matches.length === 0) {
            const li = document.createElement("li");
            li.className = "muni-menu__empty";
            li.textContent = "No se encontró ese municipio.";
            listEl.appendChild(li);
            return;
        }
        matches.forEach(m => {
            const li = document.createElement("li");
            li.setAttribute("role", "none");
            const a = document.createElement("a");
            a.className = "muni-menu__item";
            a.href = `/${m.slug}`;
            a.setAttribute("role", "menuitem");
            const tagClass = m.hasMunicipal ? "muni-menu__item-tag--muni" : "muni-menu__item-tag--state";
            const tagText = m.hasMunicipal ? "Municipal" : "Estatal";
            a.innerHTML = `<span>${m.name}</span><span class="muni-menu__item-tag ${tagClass}">${tagText}</span>`;
            li.appendChild(a);
            listEl.appendChild(li);
        });
    }

    function openMenu() {
        panel.hidden = false;
        trigger.setAttribute("aria-expanded", "true");
        search.value = "";
        renderList();
        setTimeout(() => search.focus(), 30);
    }
    function closeMenu() {
        panel.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
    }
    function toggleMenu() {
        if (panel.hidden) openMenu();
        else closeMenu();
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    search.addEventListener("input", () => renderList(search.value));
    // Enter en el buscador abre el primer resultado
    search.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const first = listEl.querySelector(".muni-menu__item");
            if (first) window.location.href = first.getAttribute("href");
        } else if (e.key === "Escape") {
            closeMenu();
            trigger.focus();
        }
    });
    // Cerrar al hacer clic fuera
    document.addEventListener("click", (e) => {
        if (!panel.hidden && !menu.contains(e.target)) closeMenu();
    });
    renderList();
}

// --- RENDERIZADO DEL DIRECTORIO DE RECURSOS ---
function renderResources() {
    const munData = getMunData(selectedMunicipio);
    const resourceTemplate = document.getElementById("resource-template");

    // Limpiar grids
    const mGrid = document.getElementById("municipal-resources-grid");
    const sGrid = document.getElementById("state-resources-grid");
    const nGrid = document.getElementById("national-resources-grid");
    
    mGrid.innerHTML = "";
    sGrid.innerHTML = "";
    nGrid.innerHTML = "";

    // Actualizar Título del Grupo Municipal
    document.querySelector("#resources-group-municipal .resources-group-title").textContent = `📍 Recursos en el municipio de ${munData.name}`;

    // Helper para poblar un recurso
    function populateResourceCard(res, container) {
        const clone = resourceTemplate.content.cloneNode(true);
        
        // Título y descripción
        clone.querySelector("h3").textContent = res.name;
        
        const descEl = clone.querySelector(".resource-card__desc");
        if (res.desc) {
            descEl.textContent = res.desc;
        } else {
            descEl.remove();
        }

        // Detalles (Dirección, Correo)
        const detailsContainer = clone.querySelector(".resource-card__details");
        let hasDetails = false;

        if (res.address) {
            hasDetails = true;
            const dirEl = document.createElement("div");
            dirEl.className = "resource-detail-item";
            dirEl.innerHTML = `<strong>Dirección:</strong> ${res.address}`;
            detailsContainer.appendChild(dirEl);
        }
        if (res.email) {
            hasDetails = true;
            const mailEl = document.createElement("div");
            mailEl.className = "resource-detail-item";
            mailEl.innerHTML = `<strong>Correo:</strong> <a href="mailto:${res.email}" style="color:var(--warm); text-decoration:none;">${res.email}</a>`;
            detailsContainer.appendChild(mailEl);
        }

        if (!hasDetails) {
            detailsContainer.remove();
        }

        // Links / Botones de acción
        const linksContainer = clone.querySelector(".resource-card__links");
        
        if (res.contact) {
            const telLink = document.createElement("a");
            telLink.className = "resource-btn resource-btn--phone";
            telLink.href = `tel:${res.contact.replace(/\D/g, "")}`;
            telLink.innerHTML = `📞 Llamar: ${res.contact}`;
            linksContainer.appendChild(telLink);
        }
        if (res.altContact) {
            const altSpan = document.createElement("span");
            altSpan.className = "resource-btn resource-btn--disabled";
            altSpan.textContent = `Alt: ${res.altContact}`;
            linksContainer.appendChild(altSpan);
        }
        if (res.whatsapp) {
            const waLink = document.createElement("a");
            waLink.className = "resource-btn resource-btn--whatsapp";
            waLink.href = `https://wa.me/${res.whatsapp.replace(/\D/g, "")}`;
            waLink.target = "_blank";
            waLink.rel = "noopener noreferrer";
            waLink.innerHTML = `💬 WhatsApp: ${res.whatsapp}`;
            linksContainer.appendChild(waLink);
        }
        if (res.link) {
            const urlLink = document.createElement("a");
            urlLink.className = "resource-btn resource-btn--link";
            urlLink.href = res.link;
            urlLink.target = "_blank";
            urlLink.rel = "noopener noreferrer";
            urlLink.innerHTML = `🔗 ${res.linkLabel || "Sitio Oficial"}`;
            linksContainer.appendChild(urlLink);
        }

        container.appendChild(clone);
    }

    // Poblar Recursos Municipales (o mensaje si no hay instancia municipal)
    if (munData.resources && munData.resources.length > 0) {
        munData.resources.forEach(res => populateResourceCard(res, mGrid));
    } else {
        populateResourceCard({
            name: `Sin instancia municipal específica en ${munData.name}`,
            desc: "En este municipio no identificamos una oficina municipal dedicada. Puedes acudir a los recursos estatales (válidos en todo Nuevo León) y a las líneas nacionales que aparecen a continuación; están disponibles para ti las 24 horas."
        }, mGrid);
    }

    // Poblar Recursos Estatales
    estatalNLResources.forEach(res => populateResourceCard(res, sGrid));

    // Poblar Recursos Nacionales
    nationalResources.forEach(res => populateResourceCard(res, nGrid));

    // Mostrar sección de recursos
    stages.resourcesSection.classList.remove("is-hidden");
}

function processResults() {
    currentQuestionId = "RESULT";
    saveSession();
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const alertBox = document.getElementById("result-alert-box");
    const messageEl = document.getElementById("result-message");
    const typesContainer = document.getElementById("violence-types-container");
    const typesGrid = document.getElementById("violence-types-grid");
    const resultTitle = document.getElementById("result-title");

    // Limpiar clases del alert box y título
    alertBox.className = "result-alert-box";
    typesGrid.innerHTML = "";
    if (resultTitle) {
        resultTitle.className = "dynamic-risk-title";
    }

    // 1. Clasificación del Nivel de Riesgo
    if (totalScore === 0) {
        document.body.classList.add("risk-low");
        if (resultTitle) {
            resultTitle.textContent = "Sin señales de violencia";
            resultTitle.classList.add("dynamic-risk-title--low");
        }
        alertBox.classList.add("result-alert-box--low");
        messageEl.textContent = "No detectamos señales claras de violencia. Si tienes dudas o no te sientes segura, te recomendamos hablar con un profesional.";
        typesContainer.classList.add("is-hidden");
    } else {
        const isHighRisk = scores.fisica > 0 || scores.sexual > 0 || totalScore >= 5;
        if (isHighRisk) {
            document.body.classList.add("risk-high");
            if (resultTitle) {
                resultTitle.textContent = "Se identifica alto riesgo";
                resultTitle.classList.add("dynamic-risk-title--high");
            }
            alertBox.classList.add("result-alert-box--high");
            messageEl.textContent = "Tus respuestas indican alto riesgo. Tu seguridad es lo más importante. Te sugerimos buscar ayuda profesional de inmediato y consultar los números de apoyo abajo.";
        } else {
            document.body.classList.add("risk-medium");
            if (resultTitle) {
                resultTitle.textContent = "Se identifica riesgo medio";
                resultTitle.classList.add("dynamic-risk-title--medium");
            }
            alertBox.classList.add("result-alert-box--medium");
            messageEl.textContent = "Detectamos señales de violencia en tus respuestas. Te sugerimos contactar a un profesional para recibir orientación y acompañamiento personalizado.";
        }

        // 2. Renderizar Tipos de Violencia Identificados
        let hasIdentifiedTypes = false;
        for (const typeKey in violenceTypeInfo) {
            if (scores[typeKey] > 0) {
                hasIdentifiedTypes = true;
                const info = violenceTypeInfo[typeKey];
                
                const card = document.createElement("div");
                card.className = `violence-type-card violence-type-card--${typeKey}`;
                card.style.cursor = "pointer";
                card.setAttribute("role", "button");
                card.setAttribute("tabindex", "0");
                card.setAttribute("title", `Ver más detalles sobre ${info.name}`);
                card.innerHTML = `
                    <h4>${info.name} <span class="card-more-icon" style="font-size: 0.85em; opacity: 0.8; float: right;">👁️ Ver detalle</span></h4>
                    <p>${info.desc}</p>
                `;
                card.addEventListener("click", () => openViolenceModal(typeKey));
                card.addEventListener("keydown", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openViolenceModal(typeKey);
                    }
                });
                typesGrid.appendChild(card);
            }
        }

        if (hasIdentifiedTypes) {
            typesContainer.classList.remove("is-hidden");
        } else {
            typesContainer.classList.add("is-hidden");
        }
    }

    // Mostrar pantalla de resultados y cargar directorio de apoyo
    showStage("result");
    renderResources();

    // Emitir resultado final (nivel de riesgo, municipio y puntajes) de forma anónima.
    if (window.ReflejaStats) {
        const rTotal = Object.values(scores).reduce((a, b) => a + b, 0);
        let riskLevel = "low";
        if (rTotal > 0) {
            const isHigh = scores.fisica > 0 || scores.sexual > 0 || rTotal >= 5;
            riskLevel = isHigh ? "high" : "medium";
        }
        ReflejaStats.result({ riskLevel: riskLevel, municipio: selectedMunicipio, scores: scores });
    }
}

// --- GESTIÓN DEL BOTÓN DE SALIDA RÁPIDA (DISFRAZ) ---
function setDisguisedState(isDisguised) {
    if (isDisguised) {
        // Ocultar test principal y barra flotante
        mainContent.classList.add("is-hidden");
        topIsland.classList.add("is-hidden");
        // Mostrar disfraz
        disguisedSite.classList.remove("is-hidden");
        // Cambiar background del body
        document.body.style.background = "#f8fafc";
        document.body.style.minHeight = "100vh";
    } else {
        // Restaurar estilos del body
        document.body.style.background = "";
        document.body.style.minHeight = "";
        // Mostrar test y barra flotante
        mainContent.classList.remove("is-hidden");
        topIsland.classList.remove("is-hidden");
        // Ocultar disfraz
        disguisedSite.classList.add("is-hidden");
    }
}

// --- GESTIÓN DEL FLUJO DE AYUDA URGENTE (BOTÓN ROJO) ---
function triggerUrgentHelp() {
    // Ocultar la sección general de recursos mientras se está en la etapa de selector urgente
    stages.resourcesSection.classList.add("is-hidden");
    urgentMunicipioSelect.value = "";
    showStage("urgentLocation");
}

function processUrgentHelp() {
    const code = urgentMunicipioSelect.value;
    const munData = getMunData(code);
    const hasMunicipal = munData.resources && munData.resources.length > 0;

    // Asignar título de urgencia local
    document.getElementById("urgent-local-title").textContent = hasMunicipal
        ? `Recursos en ${munData.name}`
        : `Apoyo para ${munData.name} (estatal)`;

    // Poblar lista local urgente. Si no hay instancia municipal, mostrar recursos estatales.
    const listContainer = document.getElementById("urgent-local-list");
    listContainer.innerHTML = "";

    const urgentList = hasMunicipal ? munData.resources : estatalNLResources;
    urgentList.forEach(res => {
        const item = document.createElement("div");
        item.className = "urgent-local-item";
        
        let linksHtml = "";
        if (res.contact) {
            linksHtml += `<a href="tel:${res.contact.replace(/\D/g, "")}" class="urgent-local-link">📞 ${res.contact}</a>`;
        }
        if (res.whatsapp) {
            linksHtml += `<a href="https://wa.me/${res.whatsapp.replace(/\D/g, "")}" target="_blank" rel="noopener noreferrer" class="urgent-local-link">💬 WA: ${res.whatsapp}</a>`;
        }
        if (res.link) {
            linksHtml += `<a href="${res.link}" target="_blank" rel="noopener noreferrer" class="urgent-local-link">🔗 Enlace</a>`;
        }

        item.innerHTML = `
            <h5>${res.name}</h5>
            <div class="urgent-local-links">${linksHtml}</div>
        `;
        listContainer.appendChild(item);
    });

    showStage("urgentResult");
}

// --- EVENT LISTENERS DE INICIO Y FORMULARIOS ---

// Iniciar test
document.getElementById("start-test").addEventListener("click", () => {
    if (!questions || Object.keys(questions).length === 0) {
        console.warn("Cuestionario no cargado aún.");
        return;
    }
    currentQuestionId = "age";
    currentStep = 0;
    totalSteps = 0;
    scores = { psicologica: 0, fisica: 0, economica: 0, patrimonial: 0, sexual: 0, intimidacion: 0 };
    answerHistory = [];
    showStage("test");
    renderQuestion();
    if (window.ReflejaStats) ReflejaStats.runStart();
});

// Enviar municipio en el test
locationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    selectedMunicipio = municipioSelect.value;
    if (selectedMunicipio) {
        if (window.ReflejaStats) ReflejaStats.municipio(selectedMunicipio);
        processResults();
    }
});

// Enviar municipio en ayuda urgente
urgentLocationForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (urgentMunicipioSelect.value) {
        processUrgentHelp();
    }
});

// Cancelar ayuda urgente
document.getElementById("cancel-urgent-location").addEventListener("click", () => {
    resetTest();
});

// Botones de repetir / volver
document.getElementById("restart-test").addEventListener("click", resetTest);
document.getElementById("restart-test-inline").addEventListener("click", resetTest);
document.getElementById("restart-minor").addEventListener("click", resetTest);
document.getElementById("close-urgent-results").addEventListener("click", resetTest);

// Eventos de barra superior
urgentHelpBtn.addEventListener("click", triggerUrgentHelp);
hideSiteBtn.addEventListener("click", () => setDisguisedState(true));
restoreSiteTrigger.addEventListener("click", () => setDisguisedState(false));

// Hacer click en el logo para reiniciar todo el portal (si existe)
if (headerLogo) {
    headerLogo.addEventListener("click", resetTest);
}

// --- EFECTO PARALLAX SUAVE EN EL FONDO ---
window.addEventListener("scroll", () => {
    // Si el disfraz está activo, no realizamos el cálculo de parallax
    if (disguisedSite && !disguisedSite.classList.contains("is-hidden")) return;

    window.requestAnimationFrame(() => {
        document.body.style.setProperty("--scroll-y", `${window.pageYOffset}px`);
    });
});

// --- INICIALIZACIÓN DE LA APLICACIÓN (CARGA DE JSON) ---
async function initApp() {
    try {
        const [formRes, munRes] = await Promise.all([
            fetch('formulario.json'),
            fetch('municipios.json')
        ]);
        
        if (!formRes.ok || !munRes.ok) {
            throw new Error(`Error en fetch: Formulario: ${formRes.status}, Municipios: ${munRes.status}`);
        }

        const formData = await formRes.json();
        const munData = await munRes.json();

        // Asignar datos a variables globales
        flowLengths = formData.flowLengths;
        questions = formData.questions;
        violenceTypeInfo = formData.violenceTypeInfo;

        municipioResources = munData.municipioResources;
        estatalNLResources = munData.estatalNLResources;
        nationalResources = munData.nationalResources;

        // Poblar los selectores de municipio y construir el menú buscable
        populateMunicipioSelects();
        buildMuniMenu();

        // Intentar restaurar sesión guardada (máx 15 min)
        const restored = restoreSession();
        if (restored) {
            if (currentQuestionId === "LOCATION") {
                showStage("location");
            } else if (currentQuestionId === "RESULT") {
                processResults();
            } else if (currentQuestionId === "MINOR") {
                showStage("minor");
            } else {
                showStage("test");
                renderQuestion();
            }
        } else {
            resetTest(true);
        }
    } catch (error) {
        console.error("Error al inicializar el portal:", error);
        
        // Mostrar mensaje de error en la interfaz
        const testTitle = document.getElementById("test-title");
        if (testTitle) {
            testTitle.textContent = "Error al cargar los datos del portal. Por favor, recarga la página.";
        }
        
        const introStage = document.getElementById("intro-stage");
        if (introStage) {
            const errorP = document.createElement("p");
            errorP.style.color = "var(--coral)";
            errorP.style.fontWeight = "bold";
            errorP.style.marginTop = "1rem";
            errorP.textContent = "⚠️ No se pudieron cargar los cuestionarios. Verifica tu conexión y recarga la página.";
            introStage.appendChild(errorP);
        }
    }
}

// --- ACCESIBILIDAD CON TECLADO ---
window.addEventListener("keydown", (e) => {
    // 0. Si el modal de detalles está visible, la tecla Escape lo cierra
    const modal = document.getElementById("violence-modal");
    if (modal && !modal.classList.contains("is-hidden")) {
        if (e.key === "Escape") {
            e.preventDefault();
            closeViolenceModal();
            return;
        }
    }

    // Si el modal de llamada QR está visible, la tecla Escape lo cierra
    const qrModal = document.getElementById("qr-call-modal");
    if (qrModal && !qrModal.classList.contains("is-hidden")) {
        if (e.key === "Escape") {
            e.preventDefault();
            closeCallQRModal();
            return;
        }
    }

    // Ignorar si se está escribiendo en inputs o usando selects (debe ejecutarse antes que cualquier otra regla)
    if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
        return;
    }

    // Si la pantalla del test no está visible
    const testStage = document.getElementById("test-stage");
    if (!testStage || testStage.classList.contains("is-hidden")) {
        // 1. Permitir Esc para reiniciar desde pantallas de menor, ubicación o resultados si se desea
        if (e.key === "Escape") {
            resetTest();
            return;
        }

        // 2. Si estamos en la pantalla de bienvenida (intro-stage) y presionamos Enter o Espacio, iniciar test
        const introStage = document.getElementById("intro-stage");
        if (introStage && !introStage.classList.contains("is-hidden")) {
            if (e.key === "Enter" || e.key === " ") {
                // No interceptar si el usuario está enfocando activamente los botones de la isla superior
                if (document.activeElement && 
                    (document.activeElement.id === "urgent-help-btn" || 
                     document.activeElement.id === "hide-site-btn")) {
                    return;
                }
                e.preventDefault();
                const startBtn = document.getElementById("start-test");
                if (startBtn) {
                    startBtn.click();
                }
            }
        }
        return;
    }

    // 1. Tecla Escape: Reiniciar cuestionario
    if (e.key === "Escape") {
        e.preventDefault();
        resetTest();
        return;
    }

    // 2. Teclas 1-9: Enfocar la opción correspondiente (para confirmación posterior con Enter/Espacio)
    if (e.key >= "1" && e.key <= "9") {
        const optionIndex = parseInt(e.key) - 1;
        const q = questions[currentQuestionId];
        if (q && q.options && q.options[optionIndex]) {
            e.preventDefault();
            const buttons = answerGrid.querySelectorAll(".answer-card");
            if (buttons && buttons[optionIndex]) {
                buttons[optionIndex].focus();
            }
        }
        return;
    }

    // 3. Navegación con flechas del teclado entre las opciones del grid
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const buttons = Array.from(answerGrid.querySelectorAll(".answer-card"));
        if (buttons.length > 0) {
            let currentIndex = buttons.indexOf(document.activeElement);
            if (currentIndex === -1) {
                currentIndex = 0;
            } else {
                // Detectar el número de columnas midiendo si el segundo botón está en la misma fila que el primero
                let cols = 1;
                if (buttons.length > 1) {
                    if (buttons[1].offsetTop === buttons[0].offsetTop) {
                        cols = 2;
                    }
                }

                if (cols === 2) {
                    if (e.key === "ArrowRight") {
                        currentIndex = (currentIndex + 1) % buttons.length;
                    } else if (e.key === "ArrowLeft") {
                        currentIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                    } else if (e.key === "ArrowDown") {
                        let nextIndex = currentIndex + 2;
                        if (nextIndex >= buttons.length) {
                            nextIndex = currentIndex % 2; // Envolver al inicio de la misma columna
                        }
                        currentIndex = nextIndex;
                    } else if (e.key === "ArrowUp") {
                        let nextIndex = currentIndex - 2;
                        if (nextIndex < 0) {
                            let col = currentIndex % 2;
                            let target = col;
                            while (target + 2 < buttons.length) {
                                target += 2;
                            }
                            nextIndex = target; // Envolver al final de la misma columna
                        }
                        currentIndex = nextIndex;
                    }
                } else {
                    // En móvil (1 columna), flecha abajo/derecha avanzan, flecha arriba/izquierda retroceden
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                        currentIndex = (currentIndex + 1) % buttons.length;
                    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                        currentIndex = (currentIndex - 1 + buttons.length) % buttons.length;
                    }
                }
            }
            buttons[currentIndex].focus();
        }
        return;
    }

    // 4. Retroceso (Backspace): Regresar a la pregunta anterior
    if (e.key === "Backspace") {
        if (answerHistory.length > 0) {
            e.preventDefault();
            if (previousBtn && !previousBtn.classList.contains("is-hidden")) {
                previousBtn.classList.add("button-action--active");
                setTimeout(() => {
                    previousBtn.classList.remove("button-action--active");
                    previousBtn.click();
                }, 120);
            }
        }
    }
});

// --- SISTEMA DE MODALES DE DETALLE ---
function openViolenceModal(typeKey) {
    const info = violenceTypeInfo[typeKey];
    if (!info) return;

    const modal = document.getElementById("violence-modal");
    const modalContent = document.getElementById("modal-content-card");
    const modalTitle = document.getElementById("modal-title-detail");
    const modalDesc = document.getElementById("modal-desc");
    const modalExamples = document.getElementById("modal-examples");
    const modalSources = document.getElementById("modal-sources");

    // Configurar contenido
    modalTitle.textContent = info.name;
    modalDesc.textContent = info.desc;
    modalSources.textContent = info.legalSource || "No especificada.";

    // Limpiar y poblar ejemplos
    modalExamples.innerHTML = "";
    if (info.examples && info.examples.length > 0) {
        info.examples.forEach(ex => {
            const li = document.createElement("li");
            li.textContent = ex;
            modalExamples.appendChild(li);
        });
    }

    // Configurar clase de color temática
    modalContent.className = "modal-card";
    modalContent.classList.add(`modal-card--${typeKey}`);

    // Mostrar modal
    modal.classList.remove("is-hidden");
    document.body.classList.add("no-scroll");
    
    // Enfocar botón de cerrar para accesibilidad
    const closeBtn = document.getElementById("close-modal-btn");
    if (closeBtn) closeBtn.focus({ preventScroll: true });

    // Guardar referencia del elemento enfocado previamente
    window.previouslyFocusedElement = document.activeElement;
}

function closeViolenceModal() {
    const modal = document.getElementById("violence-modal");
    if (modal) {
        modal.classList.add("is-hidden");
        document.body.classList.remove("no-scroll");
        // Devolver el foco al elemento anterior
        if (window.previouslyFocusedElement) {
            window.previouslyFocusedElement.focus({ preventScroll: true });
        }
    }
}

// Eventos para cerrar el modal
document.getElementById("close-modal-btn").addEventListener("click", closeViolenceModal);
document.getElementById("violence-modal").addEventListener("click", (e) => {
    if (e.target.id === "violence-modal") {
        closeViolenceModal();
    }
});

// --- SISTEMA DE QR PARA LLAMADAS EN ESCRITORIO ---
function openCallQRModal(phoneNumber, formattedNumber) {
    const modal = document.getElementById("qr-call-modal");
    const phoneEl = document.getElementById("qr-phone-number");
    const qrContainer = document.getElementById("qr-code-container");
    const titleEl = document.getElementById("qr-modal-title");
    const descTextEl = document.getElementById("qr-modal-desc-text");
    const closeBtn = document.getElementById("close-qr-modal-btn");

    if (!modal || !phoneEl || !qrContainer) return;

    phoneEl.textContent = formattedNumber || phoneNumber;
    qrContainer.innerHTML = ""; // Limpiar QR anterior

    // Si es un número corto (longitud <= 4, ej. 911, 070, 089)
    if (phoneNumber.length <= 4) {
        if (titleEl) titleEl.textContent = "Marcación directa";
        if (descTextEl) descTextEl.textContent = "Este es un número corto de marcación rápida. Abre la aplicación de teléfono en tu celular y marca directamente:";
        qrContainer.style.display = "none";
    } else {
        if (titleEl) titleEl.textContent = "Escanear para llamar";
        if (descTextEl) descTextEl.textContent = "Abre la cámara de tu celular o tu lector de códigos QR para escanear la imagen y marcar directamente al número:";
        qrContainer.style.display = "inline-flex";

        // Función para crear y renderizar el QR con QRious
        const generateQR = () => {
            const canvas = document.createElement("canvas");
            qrContainer.appendChild(canvas);
            new QRious({
                element: canvas,
                value: `tel:${phoneNumber}`,
                size: 200,
                level: 'H',
                foreground: '#301034', // color --wine
                background: '#ffffff'
            });
        };

        // Cargar la librería dinámicamente si no está cargada
        if (typeof QRious === "undefined") {
            const script = document.createElement("script");
            script.src = "/libs/qrious.min.js";
            script.onload = generateQR;
            document.head.appendChild(script);
        } else {
            generateQR();
        }
    }

    modal.classList.remove("is-hidden");
    document.body.classList.add("no-scroll");
    if (closeBtn) closeBtn.focus({ preventScroll: true });
    window.previouslyFocusedElement = document.activeElement;
}

function closeCallQRModal() {
    const modal = document.getElementById("qr-call-modal");
    if (modal) {
        modal.classList.add("is-hidden");
        document.body.classList.remove("no-scroll");
        if (window.previouslyFocusedElement) {
            window.previouslyFocusedElement.focus({ preventScroll: true });
        }
    }
}

// Eventos para cerrar el modal de llamada QR
const closeQrBtn = document.getElementById("close-qr-modal-btn");
if (closeQrBtn) closeQrBtn.addEventListener("click", closeCallQRModal);

const qrModal = document.getElementById("qr-call-modal");
if (qrModal) {
    qrModal.addEventListener("click", (e) => {
        if (e.target.id === "qr-call-modal") {
            closeCallQRModal();
        }
    });
}

// Escuchador global de clics para enlaces de teléfono
document.addEventListener("click", (e) => {
    const telLink = e.target.closest('a');
    if (!telLink) return;

    const href = telLink.getAttribute("href") || "";
    if (href.startsWith("tel:") || telLink.href.startsWith("tel:")) {
        // Detectar si es escritorio o tablet (no móvil)
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (window.innerWidth < 768);
        if (!isMobile) {
            e.preventDefault();
            const phoneNumber = href.replace("tel:", "").split("?")[0].trim();
            const formattedNumber = telLink.textContent.replace("📞 Llamar:", "").replace("📞", "").trim();
            openCallQRModal(phoneNumber, formattedNumber);
        }
    }
});

// Iniciar aplicación
initApp();
