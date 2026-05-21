const API_RATES = '/api/rates';
const API_HISTORY = '/api/history';
const REQUEST_TIMEOUT_MS = 8000;

// State
// State
let state = {
    rates: {
        official: 0,
        parallel: 0,
        usdt: 0,
        eur_usd: 0
    },
    lastUpdated: null,
    baseCurrency: 'USD',
    isReversed: false,
    amount: 1,
    theme: localStorage.getItem('theme') || 'binance',
    history: {
        official: [],
        parallel: [],
        usdt: []
    }
};

// DOM Elements
const els = {
    amountInput: document.getElementById('amount-foreign'),
    resultOfficial: document.getElementById('result-official'),
    resultParallel: document.getElementById('result-parallel'),
    resultUsdt: document.getElementById('result-usdt'),
    rateOfficial: document.getElementById('rate-official'),
    rateParallel: document.getElementById('rate-parallel'),
    rateUsdt: document.getElementById('rate-usdt'),
    lastUpdate: document.getElementById('last-update-time'),
    themeSelector: document.getElementById('theme-selector'),
    currencyRadios: document.querySelectorAll('input[name="base-currency"]'),
    currencySymbol: document.querySelector('.currency-symbol'),
    modeBtns: document.querySelectorAll('.mode-btn'),
    sections: {
        convert: document.getElementById('converter-section'),
        calculate: document.getElementById('calculator-section')
    },
    calcForeign: document.getElementById('calc-foreign'),
    calcVes: document.getElementById('calc-ves'),
    resultImplied: document.getElementById('result-implied'),
    copyBtns: document.querySelectorAll('.copy-btn'),
    chartCanvas: document.getElementById('historyChart')
};
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureLocalFallbackDataLoaded() {
    if (window.location.protocol !== 'file:') return;

    const tasks = [];
    if (!window.LOCAL_RATES) tasks.push(loadScript('./data/rates.js'));
    if (!window.LOCAL_HISTORY) tasks.push(loadScript('./data/history.js'));

    if (tasks.length === 0) return;

    try {
        await Promise.all(tasks);
        console.log('Local fallback datasets loaded for file:// runtime');
    } catch (err) {
        console.warn('Local fallback data scripts could not be loaded:', err);
    }
}

async function fetchJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
        });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} (${response.statusText})`);
        }
        return await response.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

function applyRatesPayload(data) {
    if (!data || typeof data !== 'object') return false;

    const official = Number(data.official);
    const parallel = Number(data.parallel);
    const usdt = Number(data.usdt);
    const eurUsd = Number(data.eur_usd);

    state.rates.official = Number.isFinite(official) ? official : 0;
    state.rates.parallel = Number.isFinite(parallel) ? parallel : 0;
    state.rates.usdt = Number.isFinite(usdt) ? usdt : 0;
    state.rates.eur_usd = Number.isFinite(eurUsd) && eurUsd > 0 ? eurUsd : 1;

    if (data.lastUpdated) {
        const parsedDate = new Date(data.lastUpdated);
        if (!isNaN(parsedDate.getTime())) {
            state.lastUpdated = parsedDate;
        }
    }

    return true;
}

function normalizeSeries(series) {
    if (!Array.isArray(series)) return [];
    return series
        .map((item) => ({
            date: item?.date,
            value: Number(item?.value)
        }))
        .filter((item) => item.date && Number.isFinite(item.value));
}

function applyHistoryPayload(data) {
    if (!data || typeof data !== 'object') return false;

    state.history = {
        official: normalizeSeries(data.official),
        parallel: normalizeSeries(data.parallel),
        usdt: normalizeSeries(data.usdt)
    };

    return true;
}

async function refreshDataAndUI() {
    await Promise.all([fetchData(), fetchHistory()]);
    updateUI();
    initChart();
}

// Init
async function init() {
    applyTheme(state.theme);
    setupEventListeners();
    await ensureLocalFallbackDataLoaded();
    await refreshDataAndUI();
    scheduleNextFetch();
    registerServiceWorker();
}

// Auto-Fetch Scheduler (Every 4h)
function scheduleNextFetch() {
    const now = new Date();
    const intervals = [2, 6, 10, 14, 18, 22]; // UTC hours
    const currentHour = now.getUTCHours();
    let nextHour = intervals.find(h => h > currentHour);
    if (nextHour === undefined) nextHour = intervals[0];

    const nextFetch = new Date(now);
    nextFetch.setUTCHours(nextHour, 0, 0, 0);
    if (nextFetch <= now) nextFetch.setDate(nextFetch.getDate() + 1);

    const delay = nextFetch - now;
    console.log(`Next auto-fetch scheduled for: ${nextFetch.toLocaleTimeString()} (in ${Math.round(delay / 60000)} mins)`);

    setTimeout(async () => {
        console.log('Auto-fetching data...');
        await refreshDataAndUI();
        scheduleNextFetch();
    }, delay);
}

// Fetch Current Data
async function fetchData() {
    try {
        console.log('Fetching rates...');

        if (window.location.protocol === 'file:') {
            if (!applyRatesPayload(window.LOCAL_RATES)) {
                throw new Error('LOCAL_RATES not available for file:// runtime');
            }
            return;
        }

        const payload = await fetchJson(API_RATES);
        if (!applyRatesPayload(payload)) {
            throw new Error('Invalid rates payload');
        }
        els.lastUpdate.style.color = '';

    } catch (error) {
        console.error('Error fetching rates:', error);
        if (window.location.protocol !== 'file:' && window.LOCAL_RATES) {
            console.warn('Falling back to LOCAL_RATES after API error');
            applyRatesPayload(window.LOCAL_RATES);
            return;
        }

        if ((!state.rates.official || state.rates.official === 0) && document.getElementById('last-update-time')) {
            document.getElementById('last-update-time').innerText = "Error: " + error.message;
            document.getElementById('last-update-time').style.color = "red";
        }
    }
}

// Fetch History
async function fetchHistory() {
    try {
        if (window.location.protocol === 'file:') {
            if (!applyHistoryPayload(window.LOCAL_HISTORY)) {
                throw new Error('LOCAL_HISTORY not available for file:// runtime');
            }
            return;
        }
        const payload = await fetchJson(API_HISTORY);
        if (!applyHistoryPayload(payload)) {
            throw new Error('Invalid history payload');
        }

    } catch (error) {
        console.error('Error fetching history:', error);
        if (window.location.protocol !== 'file:' && window.LOCAL_HISTORY) {
            console.warn('Falling back to LOCAL_HISTORY after API error');
            applyHistoryPayload(window.LOCAL_HISTORY);
        }
    }
}

// UI Updates
function updateUI() {
    const isUSD = state.baseCurrency === 'USD';
    const currencySymbol = isUSD ? '$' : '€';
    const vesSymbol = 'Bs';

    // Update Input Labels and Symbols
    const inputLabel = document.querySelector('label[for="amount-foreign"]');
    const inputSymbol = document.querySelector('.input-wrapper .currency-symbol');

    if (state.isReversed) {
        inputLabel.textContent = 'Monto en Bolívares';
        inputSymbol.textContent = vesSymbol;
    } else {
        inputLabel.textContent = 'Monto en Divisa';
        inputSymbol.textContent = currencySymbol;
    }

    // Calculate Rates
    const conversionFactor = isUSD ? 1 : (1 / state.rates.eur_usd);
    const rateOfficial = state.rates.official * conversionFactor;
    const rateParallel = state.rates.parallel * conversionFactor;
    const rateUsdt = state.rates.usdt * conversionFactor;

    // Update Rate Displays
    els.rateOfficial.textContent = `1 ${state.baseCurrency} = ${formatCurrency(rateOfficial)} Bs`;
    els.rateParallel.textContent = `1 ${state.baseCurrency} = ${formatCurrency(rateParallel)} Bs`;
    els.rateUsdt.textContent = `1 ${state.baseCurrency} = ${formatCurrency(rateUsdt)} Bs`;

    // Calculate Results
    let resultOff, resultPar, resultUsdt;

    if (state.isReversed) {
        // VES -> Foreign
        resultOff = rateOfficial > 0 ? state.amount / rateOfficial : 0;
        resultPar = rateParallel > 0 ? state.amount / rateParallel : 0;
        resultUsdt = rateUsdt > 0 ? state.amount / rateUsdt : 0;
    } else {
        // Foreign -> VES
        resultOff = state.amount * rateOfficial;
        resultPar = state.amount * rateParallel;
        resultUsdt = state.amount * rateUsdt;
    }

    // Update Result Displays
    els.resultOfficial.textContent = formatCurrency(resultOff);
    els.resultParallel.textContent = formatCurrency(resultPar);
    els.resultUsdt.textContent = formatCurrency(resultUsdt);

    // Update Result Currency Codes
    const resultCodes = document.querySelectorAll('.result-amount .currency-code');
    resultCodes.forEach(code => {
        code.textContent = state.isReversed ? state.baseCurrency : vesSymbol;
    });

    if (state.lastUpdated) {
        els.lastUpdate.textContent = state.lastUpdated.toLocaleTimeString();
    }
}

function formatCurrency(val) {
    if (!val) return '0.00';
    return val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Event Listeners
function setupEventListeners() {
    // Theme
    if (els.themeSelector) {
        els.themeSelector.value = state.theme;
        els.themeSelector.addEventListener('change', (e) => {
            state.theme = e.target.value;
            localStorage.setItem('theme', state.theme);
            applyTheme(state.theme);
        });
    }

    // Currency Toggle
    els.currencyRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.baseCurrency = e.target.value;
            updateUI();
        });
    });

    // Swap Currencies
    document.getElementById('swap-currencies').addEventListener('click', () => {
        state.isReversed = !state.isReversed;
        updateUI();
    });

    // Amount Input
    els.amountInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        state.amount = isNaN(val) ? 0 : val;
        updateUI();
    });

    // Mode Selector
    els.modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            els.modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            Object.values(els.sections).forEach(s => s.classList.remove('active-section'));
            els.sections[mode].classList.add('active-section');
        });
    });

    // Implied Rate Calculator
    const updateImplied = () => {
        const foreign = parseFloat(els.calcForeign.value);
        const ves = parseFloat(els.calcVes.value);

        if (foreign && ves) {
            const rate = ves / foreign;
            els.resultImplied.textContent = formatCurrency(rate);
        } else {
            els.resultImplied.textContent = '0.00';
        }
    };
    els.calcForeign.addEventListener('input', updateImplied);
    els.calcVes.addEventListener('input', updateImplied);

    // Copy Buttons
    els.copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const text = document.getElementById(targetId).textContent;
            navigator.clipboard.writeText(text.replace(/\./g, '').replace(',', '.'));

            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
            setTimeout(() => btn.innerHTML = originalHTML, 1500);
        });
    });
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

// Chart
function initChart() {
    const ctx = els.chartCanvas.getContext('2d');

    // We need to merge all dates from all sources to create a unified timeline
    const officialHistory = state.history.official || [];
    const parallelHistory = state.history.parallel || [];
    const usdtHistory = state.history.usdt || [];

    if (officialHistory.length === 0 && parallelHistory.length === 0 && usdtHistory.length === 0) {
        return; // Defensive early return if no data is loaded yet
    }

    const allDates = new Set([
        ...officialHistory.map(i => i.date.split('T')[0]),
        ...parallelHistory.map(i => i.date.split('T')[0]),
        ...usdtHistory.map(i => i.date.split('T')[0])
    ]);

    // Sort dates
    const sortedDates = Array.from(allDates).sort();

    // Map data to dates (Nearest or Null)
    function mapValues(sourceArr) {
        const map = new Map();
        sourceArr.forEach(item => {
            const d = item.date.split('T')[0];
            map.set(d, item.value || item.parallel);
        });
        return sortedDates.map(d => map.get(d) || null);
    }

    const dataOfficial = mapValues(officialHistory);
    const dataParallel = mapValues(parallelHistory);
    const dataUsdt = mapValues(usdtHistory);

    // Labels (format DD/MM)
    const labels = sortedDates.map(d => {
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}`;
    });

    if (window.myLineChart) {
        window.myLineChart.destroy();
    }

    // Helper functions for dynamic style retrieval
    const getStyleVar = (varName, defaultVal) => {
        const val = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return val || defaultVal;
    };

    const hexToRgba = (hex, alpha) => {
        hex = hex.trim();
        if (hex.startsWith('color-mix') || hex.startsWith('rgba') || hex.startsWith('rgb')) {
            return hex;
        }
        let r = 0, g = 0, b = 0;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else if (hex.length === 7) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else {
            return hex;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };

    const bcvColor = getStyleVar('--bcv-color', '#0ecb81');
    const paraleloColor = getStyleVar('--paralelo-color', '#3b82f6');
    const usdtColor = getStyleVar('--usdt-color', '#fcd535');
    const textColor = getStyleVar('--text-secondary', '#707a8a');
    const textPrimaryColor = getStyleVar('--text-primary', '#eaecef');
    const cardBgColor = getStyleVar('--card-bg', '#1e2329');
    const borderColor = getStyleVar('--border-color', '#2b3139');

    window.myLineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Oficial (BCV)',
                    data: dataOfficial,
                    borderColor: bcvColor,
                    backgroundColor: hexToRgba(bcvColor, 0.1),
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    spanGaps: true
                },
                {
                    label: 'Paralelo',
                    data: dataParallel,
                    borderColor: paraleloColor,
                    backgroundColor: hexToRgba(paraleloColor, 0.1),
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    spanGaps: true
                },
                {
                    label: 'USDT (Binance)',
                    data: dataUsdt,
                    borderColor: usdtColor,
                    backgroundColor: hexToRgba(usdtColor, 0.1),
                    fill: false,
                    tension: 0.4,
                    pointRadius: 2,
                    spanGaps: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    labels: {
                        color: textColor,
                        font: { family: "'Outfit', sans-serif" }
                    }
                },
                tooltip: {
                    backgroundColor: cardBgColor,
                    titleColor: textPrimaryColor,
                    bodyColor: textColor,
                    borderColor: borderColor,
                    borderWidth: 1
                }
            },
            scales: {
                y: {
                    grid: { color: borderColor, drawBorder: false },
                    ticks: { color: textColor }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: textColor, maxTicksLimit: 8 }
                }
            }
        }
    });
}

// Start
init();

// Antigravity Particle Animation
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let animationId;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
        this.color = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;

        // Bounce off edges
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = 0.5;
        ctx.fill();
    }
}

function initParticles() {
    particles = [];
    const particleCount = Math.min(window.innerWidth / 10, 100); // Responsive count
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animateParticles() {
    // Fill background with current theme color so it updates on theme switch
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg-color').trim();
    ctx.globalAlpha = 1;
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Update accent color dynamically (in case of theme switch)
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();

    particles.forEach((p, index) => {
        p.color = accent;
        p.update();

        // Draw particle dot — reset alpha first so it's never inherited from line draws
        ctx.globalAlpha = 0.5;
        p.draw();

        // Draw connections
        for (let j = index + 1; j < particles.length; j++) {
            const p2 = particles[j];
            const dx = p.x - p2.x;
            const dy = p.y - p2.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 150) {
                ctx.beginPath();
                ctx.strokeStyle = accent;
                ctx.globalAlpha = (1 - (distance / 150)) * 0.6;
                ctx.lineWidth = 0.5;
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    });

    // Always reset alpha after frame
    ctx.globalAlpha = 1;
    animationId = requestAnimationFrame(animateParticles);
}

initParticles();
animateParticles();

// Re-init on theme change to catch new colors immediately
const observer = new MutationObserver(() => {
    // Wait for the browser to apply the new CSS variables
    setTimeout(() => {
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-color').trim();
        if (accent) {
            particles.forEach(p => p.color = accent);
        }
        initChart();
    }, 50);
});
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol === 'file:') return;

    const onReady = async () => {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', registration.scope);
        } catch (err) {
            console.warn('Service Worker registration failed:', err);
        }
    };

    if (document.readyState === 'complete') {
        onReady();
    } else {
        window.addEventListener('load', onReady, { once: true });
    }
}
