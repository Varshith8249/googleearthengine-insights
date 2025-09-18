let accessToken = null; // Store OAuth token globally
let currentUser = null; // Store user info
const requestCache = new Map(); // Client-side caching

/* =========================
  CONFIG
========================= */
const DATASETS = {
  S2: {
    label: 'Sentinel-2 SR (NDVI)',
    id: 'COPERNICUS/S2_SR',
    vis: {min: 0, max: 1, palette: ['#b8860b', '#ffff66', '#00a65a', '#006837']},
    scale: 20,
    // REMOVED: computeImage function is now dynamic
    legend: [
      {c:'#b8860b', t:'Low'}, {c:'#ffff66', t:'Moderate'},
      {c:'#00a65a', t:'High'}, {c:'#006837', t:'Very High'},
    ],
    supportsNdvi: true,
    description: 'Sentinel-2 Surface Reflectance provides high-resolution (10-60m) imagery with a revisit time of 5 days. You can select custom bands to calculate indices like NDVI.',
    maxDays: 365,
    // ADDED: Band selection info
    supportsBandSelection: true,
    bands: [
        { name: 'B8 - NIR', value: 'B8' }, { name: 'B4 - Red', value: 'B4' },
        { name: 'B3 - Green', value: 'B3' }, { name: 'B11 - SWIR1', value: 'B11' },
        { name: 'B12 - SWIR2', value: 'B12' }, { name: 'B2 - Blue', value: 'B2' }
    ],
    defaultBands: { nir: 'B8', red: 'B4' }
  },
  L8: {
    label: 'Landsat 8 SR (NDVI)',
    id: 'LANDSAT/LC08/C02/T1_L2',
    vis: {min: 0, max: 1, palette: ['#b8860b', '#ffff66', '#00a65a', '#006837']},
    scale: 30,
    // REMOVED: computeImage function is now dynamic
    legend: [
      {c:'#b8860b', t:'Low'}, {c:'#ffff66', t:'Moderate'},
      {c:'#00a65a', t:'High'}, {c:'#006837', t:'Very High'},
    ],
    supportsNdvi: true,
    description: 'Landsat 8 Surface Reflectance offers 30m resolution imagery. You can select custom bands to calculate indices like NDVI.',
    maxDays: 730,
    // ADDED: Band selection info
    supportsBandSelection: true,
    bands: [
        { name: 'B5 - NIR', value: 'SR_B5' }, { name: 'B4 - Red', value: 'SR_B4' },
        { name: 'B3 - Green', value: 'SR_B3' }, { name: 'B6 - SWIR1', value: 'SR_B6' },
        { name: 'B7 - SWIR2', value: 'SR_B7' }, { name: 'B2 - Blue', value: 'SR_B2' }
    ],
    defaultBands: { nir: 'SR_B5', red: 'SR_B4' }
  },
  MODIS: {
    label: 'MODIS NDVI (Terra)',
    id: 'MODIS/006/MOD13Q1',
    vis: {min: 0, max: 1, palette: ['#b8860b', '#ffff66', '#00a65a', '#006837']},
    scale: 250,
    computeImage: (img) => img.select('NDVI').multiply(0.0001).rename('NDVI'),
    legend: [{c:'#b8860b', t:'Low'},{c:'#ffff66', t:'Moderate'},{c:'#00a65a', t:'High'},{c:'#006837', t:'Very High'},],
    supportsNdvi: true,
    description: 'MODIS 16-day composite. IMPORTANT: For best results, analyze smaller areas (e.g., state-level) and shorter time periods (under 2 years). Large queries may time out.',
    maxDays: 730
  },
  VIIRS: {
    label: 'VIIRS Nighttime Lights',
    id: 'NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG',
    vis: {min: 0, max: 60, palette: ['#000000','#ffff33','#ffffff']},
    scale: 500,
    computeImage: (img) => img.select('avg_rad').rename('value'),
    legend: [{c:'#000000', t:'Low'},{c:'#ffff33', t:'Moderate'},{c:'#ffffff', t:'High'},],
    supportsNdvi: false,
    description: 'VIIRS Nighttime Lights show human activity at night with 500m resolution',
    maxDays: 3650
  },
  CHIRPS: {
    label: 'CHIRPS Precipitation',
    id: 'UCSB-CHG/CHIRPS/DAILY',
    vis: {min: 0, max: 100, palette: ['#ffffff', '#4aa3ff', '#003b8e']},
    scale: 5000,
    computeImage: (img) => img.select('precipitation').rename('value'),
    legend: [{c:'#ffffff', t:'Low'},{c:'#4aa3ff', t:'Moderate'},{c:'#003b8e', t:'High'},],
    supportsNdvi: false,
    description: 'CHIRPS provides global precipitation data at 0.05° resolution',
    maxDays: 365
  },
  SMAP: {
    label: 'SMAP Soil Moisture',
    id: 'NASA/SMAP/SPL3SMP_E/005',
    vis: {min: 0, max: 40, palette: ['#fffae2', '#b38621', '#52a6a6', '#00334d']},
    scale: 9000,
    computeImage: (img) => img.select('soil_moisture_am').rename('value'),
    legend: [{c:'#fffae2', t:'Dry'},{c:'#b38621', t:'Moderate'},{c:'#52a6a6', t:'Wet'},{c:'#00334d', t:'Very Wet'},],
    supportsNdvi: false,
    description: 'SMAP Enhanced L3 soil moisture from the morning (AM) overpass. Represents water content (mm) in the top 5cm of soil at ~9km resolution. Data is available from April 2015 to present.',
    maxDays: 1825
  },
  LST: {
    label: 'MODIS Land Surface Temp. (Day)',
    id: 'MODIS/061/MOD11A1',
    vis: {min: 0, max: 50, palette: ['#0000ff', '#ffff00', '#ff0000']},
    scale: 1000,
    computeImage: (img) => {
      const lstDay = img.select('LST_Day_1km');
      const lstCelsius = lstDay.multiply(0.02).subtract(273.15).rename('value');
      const qa = img.select('QC_Day');
      const goodQuality = qa.bitwiseAnd(0b11).eq(0);
      return lstCelsius.updateMask(goodQuality);
    },
    legend: [{c:'#0000ff', t:'Cool (<10°C)'},{c:'#ffff00', t:'Moderate (25°C)'},{c:'#ff0000', t:'Hot (>40°C)'},],
    supportsNdvi: false,
    description: 'MODIS daily Land Surface Temperature (LST) at 1km resolution. Values are in Celsius. Note: Cloud cover can result in significant no-data areas.',
    maxDays: 730
  },
  JRC_WATER: {
    label: 'JRC Surface Water Occurrence',
    id: 'JRC/GSW1_4/GlobalSurfaceWater',
    vis: {min: 0, max: 100, palette: ['#B2EBF2', '#4DD0E1', '#00ACC1', '#006064']},
    scale: 30,
    computeImage: (img) => img.select('occurrence').rename('value'),
    legend: [{c:'#B2EBF2', t:'Infrequent'},{c:'#4DD0E1', t:'Seasonal'},{c:'#00ACC1', t:'Frequent'},{c:'#006064', t:'Permanent'},],
    supportsNdvi: false,
    description: 'JRC Global Surface Water shows the frequency of surface water presence from 1984-2022 at 30m resolution. This is not a time-series; the date range does not affect the map.',
    maxDays: 99999
  },
  S2_NDWI: {
    label: 'Sentinel-2 (NDWI - Moisture)',
    id: 'COPERNICUS/S2_SR',
    vis: {min: -0.5, max: 0.5, palette: ['#A52A2A', '#E9967A', '#F5DEB3', '#87CEEB', '#0000FF']},
    scale: 20,
    computeImage: (img) => {
      const scl = img.select('SCL');
      const mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
      const nir = img.select('B8');
      const swir = img.select('B11');
      const ndwi = nir.subtract(swir).divide(nir.add(swir)).rename('value');
      return ndwi.updateMask(mask);
    },
    legend: [{c:'#A52A2A', t:'Very Low Moisture'},{c:'#F5DEB3', t:'Low Moisture'},{c:'#87CEEB', t:'Moderate Moisture'},{c:'#0000FF', t:'High Moisture'},],
    supportsNdvi: false,
    description: 'NDWI measures vegetation moisture content using Sentinel-2 data (20m resolution). Higher values indicate healthier, more water-rich vegetation. Excellent for drought monitoring.',
    maxDays: 365
  },
  MODIS_SNOW: {
    label: 'MODIS Daily Snow Cover',
    id: 'MODIS/061/MOD10A1',
    vis: {min: 0, max: 100, palette: ['#808080', '#f2f2f2', '#ffffff', '#2491ff']},
    scale: 500,
    computeImage: (img) => img.select('NDSI_Snow_Cover').rename('value'),
    legend: [{c:'#808080', t:'No Snow'},{c:'#ffffff', t:'Partial Snow'},{c:'#2491ff', t:'Full Snow Cover'},],
    supportsNdvi: false,
    description: 'MODIS daily snow cover at 500m resolution. Shows the percentage of a pixel covered by snow. Useful for tracking snowmelt and water resource availability.',
    maxDays: 730
  }
};

/* =========================
  STATE
========================= */
let map, drawnItems, drawControl, eeAuthorized = false, ndviTileLayer = null;
let trendChart, areaChart;
let tokenClient;
let currentDisplayImage = null;

/* =========================
  INITIALIZATION
========================= */
function initUI() {
  // Set default dates (last 3 months)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 3);
  document.getElementById('startDate').valueAsDate = startDate;
  document.getElementById('endDate').valueAsDate = endDate;

  // --- Sidebar Logic ---
  const sidebar = document.getElementById('leftSidebar');
  const mainContentWrapper = document.getElementById('mainContentWrapper');
  const toggleBtn = document.getElementById('sidebarToggle');
  const toggleIcon = document.getElementById('sidebarToggleIcon');

  if (window.innerWidth >= 1024) {
    sidebar.classList.remove('-translate-x-full');
    mainContentWrapper.classList.add('lg:ml-96');
    toggleBtn.classList.add('lg:left-96');
    toggleBtn.classList.remove('left-0');
    toggleIcon.classList.remove('rotate-180');
  } else {
    sidebar.classList.add('-translate-x-full');
    mainContentWrapper.classList.remove('lg:ml-96');
    toggleBtn.classList.add('left-0');
    toggleBtn.classList.remove('lg:left-96');
    toggleIcon.classList.add('rotate-180');
  }

  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    const isOpen = !sidebar.classList.contains('-translate-x-full');
    
    if (isOpen) {
      toggleBtn.classList.remove('left-0');
      toggleBtn.classList.add('lg:left-96');
      toggleIcon.classList.remove('rotate-180');
    } else {
      toggleBtn.classList.remove('lg:left-96');
      toggleBtn.classList.add('left-0');
      toggleIcon.classList.add('rotate-180');
    }
    
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 350);
  });
  
  // Initialize other UI components
  initMap();
  initCharts();
  updateDatasetInfo();
  
  // Event listeners
  document.getElementById('drawBtn').addEventListener('click', () => 
    drawControl._toolbars.draw._modes.polygon.handler.enable());
  document.getElementById('clearBtn').addEventListener('click', clearShapes);
  document.getElementById('analyzeBtn').addEventListener('click', analyze);
  document.getElementById('downloadPng').addEventListener('click', downloadPng);
  document.getElementById('dataset').addEventListener('change', () => {
    updateDatasetInfo();
    updateBandSelectors(); // Add this call
  });
  document.getElementById('mobileSidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
      }
    }, 350);
  });

  window.addEventListener('resize', handleWindowResize);

  document.getElementById('downloadPng').disabled = true;
  updateGuidance();
  updateBandSelectors();
}

function updateDatasetInfo() {
  const datasetKey = document.getElementById('dataset').value;
  const ds = DATASETS[datasetKey];
  const infoEl = document.getElementById('datasetInfo');
  infoEl.innerHTML = `<p class="font-bold text-primary-400">${ds.label}</p><p class="mt-2 text-sm">${ds.description}</p><p class="mt-2 text-xs text-slate-500">Resolution: ${ds.scale}m</p>`;
}

function updateBandSelectors() {
  const datasetKey = document.getElementById('dataset').value;
  const ds = DATASETS[datasetKey];
  const container = document.getElementById('bandSelectorContainer');
  const nirSelect = document.getElementById('nirBandSelect');
  const redSelect = document.getElementById('redBandSelect');

  if (ds.supportsBandSelection) {
    nirSelect.innerHTML = '';
    redSelect.innerHTML = '';

    ds.bands.forEach(band => {
      const optionNir = new Option(band.name, band.value);
      const optionRed = new Option(band.name, band.value);
      nirSelect.add(optionNir);
      redSelect.add(optionRed);
    });

    nirSelect.value = ds.defaultBands.nir;
    redSelect.value = ds.defaultBands.red;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

function handleWindowResize() {
  const sidebar = document.getElementById('leftSidebar');
  const mainContentWrapper = document.getElementById('mainContentWrapper');
  const toggleBtn = document.getElementById('sidebarToggle');
  const toggleIcon = document.getElementById('sidebarToggleIcon');

  if (window.innerWidth >= 1024) {
    sidebar.classList.remove('-translate-x-full');
    mainContentWrapper.classList.add('lg:ml-96');
    toggleBtn.classList.add('lg:left-96');
    toggleBtn.classList.remove('left-0');
    toggleIcon.classList.remove('rotate-180');
  } else {
    sidebar.classList.add('-translate-x-full');
    mainContentWrapper.classList.remove('lg:ml-96');
    toggleBtn.classList.add('left-0');
    toggleBtn.classList.remove('lg:left-96');
    toggleIcon.classList.add('rotate-180');
  }
  
  if (map) {
    setTimeout(() => map.invalidateSize(), 100);
  }
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: false }).setView([20.5937, 78.9629], 5);

  const darkBasemap = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: 'CARTO', maxZoom: 20
  });
  const satelliteBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri', maxZoom: 20
  });

  darkBasemap.addTo(map);

  const baseMaps = {
      "Dark": darkBasemap,
      "Satellite": satelliteBasemap
  };
  L.control.layers(baseMaps, null, { position: 'topright' }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  drawnItems = new L.FeatureGroup();
  map.addLayer(drawnItems);

  drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      marker: false, circle: false, circlemarker: false, rectangle: false, polyline: false,
      polygon: {
        allowIntersection: false, showArea: true,
        shapeOptions: { 
          color: '#34d399',
          weight: 3, 
          opacity: 0.9,
          fillOpacity: 0.15,
          fillColor: '#34d399'
        }
      }
    },
    edit: { featureGroup: drawnItems, edit: false }
  });
  map.addControl(drawControl);

  map.on(L.Draw.Event.CREATED, function (e) {
    drawnItems.clearLayers();
    drawnItems.addLayer(e.layer);
    const areaKm2 = turf.area(e.layer.toGeoJSON()) / 1e6;
    document.getElementById('areaName').textContent = `Selected area: ${areaKm2.toFixed(1)} km²`;
    document.getElementById('areaSize').textContent = `${areaKm2.toFixed(1)} km²`;
    updateGuidance();
  });

  map.on('click', inspectPixel);
}

function clearShapes() {
  drawnItems.clearLayers();
  document.getElementById('areaName').textContent = 'No area selected';
  document.getElementById('areaSize').textContent = '–';
  updateGuidance();
}

function initCharts() {
  const gridColor = 'rgba(100, 116, 139, 0.2)';
  const textColor = '#94a3b8';

  const createGradient = (ctx, color) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, 400);
      gradient.addColorStop(0, `${color}40`);
      gradient.addColorStop(1, `${color}00`);
      return gradient;
  }

  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: { 
      labels: [], 
      datasets: [{ 
        label: 'Mean Value', 
        data: [], 
        tension: 0.4, 
        pointRadius: 2,
        pointBackgroundColor: '#e879f9',
        borderColor: '#e879f9',
        backgroundColor: (context) => createGradient(context.chart.ctx, '#d946ef'),
        borderWidth: 2,
        fill: true
      }] 
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y?.toFixed(3) || 'N/A'}` } } },
      scales: { 
        y: { grid: { color: gridColor }, ticks: { color: textColor }, beginAtZero: false },
        x: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });

  areaChart = new Chart(document.getElementById('areaChart'), {
    type: 'bar',
    data: { 
      labels: [], 
      datasets: [{ 
        label: '% area', 
        data: [],
        backgroundColor: ['#b8860b80', '#ffff6680', '#00a65a80', '#00683780'],
        borderColor: ['#b8860b', '#ffff66', '#00a65a', '#006837'],
        borderWidth: 1
      }] 
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${c.parsed.y?.toFixed(1) || '0'}%` } } },
      scales: {
        y: { suggestedMin: 0, suggestedMax: 100, grid: { color: gridColor }, ticks: { color: textColor, callback: v => v + '%' } },
        x: { grid: { color: gridColor }, ticks: { color: textColor } }
      }
    }
  });
}

/* =========================
  AUTHENTICATION
========================= */
function initAuthAndListeners() {
  // REPLACE THIS WITH YOUR ACTUAL GOOGLE CLOUD CLIENT ID
  const clientId = '330442621130-bma7mksnjlai4lggse108cpa0hqh61c2.apps.googleusercontent.com';
  
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/earthengine',
    callback: (tokenResponse) => {
      if (tokenResponse.error) {
        console.error("Auth failed:", tokenResponse);
        showToast("Authentication failed. Please try again.", 'error');
        return;
      }
      accessToken = tokenResponse.access_token;
      if (tokenResponse.expires_in) {
        localStorage.setItem('tokenExpiry', (Date.now() + (tokenResponse.expires_in * 1000)).toString());
      }
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { 'Authorization': `Bearer ${accessToken}` } })
      .then(res => res.json())
      .then(user => {
        currentUser = user;
        updateAuthUI(true);
      });
      ee.data.setAuthToken('CLIENT_ID', 'Bearer', accessToken, 3600, null, () => initEE(), true);
    }
  });
  document.getElementById('signInBtn').addEventListener('click', () => tokenClient.requestAccessToken({ prompt: 'consent' }));
}

function initEE() {
  ee.initialize(null, null, 
    () => {
      eeAuthorized = true;
      showToast('Successfully connected to Earth Engine', 'success');
      console.log('EE initialized successfully');
    }, 
    (err) => {
      showToast("Earth Engine initialization failed: " + err, 'error');
      console.error('EE init error:', err);
    }
  );
}

function updateAuthUI(isAuthenticated) {
  const signInBtn = document.getElementById('signInBtn');
  if (isAuthenticated) {
    signInBtn.innerHTML = `<i class="fas fa-user-circle"></i> <span>${currentUser?.name || 'Account'}</span>`;
    signInBtn.classList.remove('bg-primary-500', 'hover:bg-primary-600', 'hover:shadow-glow-primary');
    signInBtn.classList.add('bg-slate-700');
  } else {
    signInBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> <span>Sign in</span>`;
    signInBtn.classList.add('bg-primary-500', 'hover:bg-primary-600', 'hover:shadow-glow-primary');
    signInBtn.classList.remove('bg-slate-700');
  }
  updateGuidance();
}

setInterval(() => {
  if (accessToken) {
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    if (tokenExpiry && Date.now() > parseInt(tokenExpiry) - 300000) {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  }
}, 60000);

/* =========================
  ANALYSIS FUNCTIONS
========================= */
async function analyze() {
  try {
    if (!eeAuthorized) return showToast('Please sign in first', 'error');
    const layer = drawnItems.getLayers()[0];
    if (!layer) return showToast('Please draw a polygon area to analyze', 'error');
    
    const datasetKey = document.getElementById('dataset').value;
    const startDate = document.getElementById('startDate').value;
    const endDate = document.getElementById('endDate').value;
    if (!startDate || !endDate) return showToast('Please set a valid date range', 'error');
    
    if (!validateDateRange(datasetKey, startDate, endDate)) {
      const maxDays = DATASETS[datasetKey].maxDays;
      const maxPeriod = maxDays >= 365 ? `${Math.floor(maxDays/365)} years` : `${maxDays} days`;
      return showToast(`Date range too long. Maximum period is ${maxPeriod}.`, 'error');
    }
    if (new Date(startDate) >= new Date(endDate)) return showToast('End date must be after start date', 'error');

    setLoading(true);
    setMapLoading(true);
    document.getElementById('statsContent').classList.add('hidden');
    document.getElementById('statsSkeleton').classList.remove('hidden');
    document.getElementById('downloadPng').disabled = true;
    currentDisplayImage = null;

    const gj = layer.toGeoJSON();
    const region = ee.Geometry.Polygon(gj.geometry.coordinates, null, false);
    const ds = DATASETS[datasetKey];
    const collection = ee.ImageCollection(ds.id).filterBounds(region).filterDate(startDate, endDate);
    
    const size = await collection.size().getInfo();
    if (size === 0) {
      showToast('No satellite images found for this area and date range.', 'error');
      throw new Error('No images found');
    }

    let image;
    const computeDynamicIndex = (img) => {
        const nirBand = document.getElementById('nirBandSelect').value;
        const redBand = document.getElementById('redBandSelect').value;
        let nir, red;

        // Handle Landsat 8 scaling factors
        if (datasetKey === 'L8') {
            const scale = 2.75e-05, offset = -0.2;
            nir = img.select(nirBand).multiply(scale).add(offset);
            red = img.select(redBand).multiply(scale).add(offset);
        } else {
            nir = img.select(nirBand);
            red = img.select(redBand);
        }

        const index = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        
        // Apply dataset-specific cloud masks
        if (datasetKey === 'S2') {
            const scl = img.select('SCL');
            const mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
            return index.updateMask(mask);
        }
        if (datasetKey === 'L8') {
            const qa = img.select('QA_PIXEL');
            const cloud = qa.bitwiseAnd(1 << 3).neq(0);
            const cloudShadow = qa.bitwiseAnd(1 << 4).neq(0);
            return index.updateMask(cloud.not().and(cloudShadow.not()));
        }
        return index;
    };

    let computeFunction;
    if (ds.supportsBandSelection) {
        computeFunction = computeDynamicIndex;
    } else {
        computeFunction = ds.computeImage;
    }
    image = collection.map(computeFunction);
    let displayImage = image.median();
    
    const pixelCountDict = await displayImage.reduceRegion({ reducer: ee.Reducer.count(), geometry: region, scale: ds.scale, maxPixels: 1e9 }).getInfo();
    if (Object.keys(pixelCountDict).length === 0) {
      showToast('All images in the date range were cloudy or invalid.', 'error');
      throw new Error('All images masked');
    }

    const bandName = ds.supportsNdvi ? 'NDVI' : 'value';
    document.getElementById('mapTitle').innerHTML = `<i class="fas fa-map text-primary-400"></i><span> ${ds.label}</span>`;
    if (ndviTileLayer) { map.removeLayer(ndviTileLayer); ndviTileLayer = null; }
    
    displayImage = displayImage.clip(region);
    currentDisplayImage = displayImage;
    
    await new Promise((resolve, reject) => {
      ee.data.getMapId({ image: displayImage, visParams: ds.vis }, (mapid, error) => {
        if (error) return reject(new Error(error));
        if (mapid) {
          ndviTileLayer = L.tileLayer(mapid.urlFormat, { attribution: 'Google Earth Engine', maxZoom: 20 }).addTo(map);
          fitToRegion(gj);
          renderLegend(ds.legend);
          resolve();
        } else {
          reject(new Error("Could not get map layer from Earth Engine."));
        }
      });
    });

    const cacheKey = `${datasetKey}-${startDate}-${endDate}-${JSON.stringify(gj.geometry.coordinates)}`;
    
    await Promise.all([
      cachedEeRequest(`stats-${cacheKey}`, () => calculateStats(region, ds, bandName, image)),
      cachedEeRequest(`trend-${cacheKey}`, () => calculateTrend(collection, region, ds, bandName, computeFunction)),
      ds.supportsNdvi ? cachedEeRequest(`classes-${cacheKey}`, () => calculateNdviClasses(displayImage, region, ds.scale)) : Promise.resolve()
    ]);

    const areaChartCard = document.getElementById('areaChartCard');
    areaChartCard.style.display = ds.supportsNdvi ? 'block' : 'none';
    document.getElementById('downloadPng').disabled = false;

  } catch (e) {
    onEeError(e);
  } finally {
    setLoading(false);
    setMapLoading(false);
    document.getElementById('statsContent').classList.remove('hidden');
    document.getElementById('statsSkeleton').classList.add('hidden');
  }
}

async function inspectPixel(e) {
  if (!currentDisplayImage || !eeAuthorized) return;

  const inspector = document.getElementById('mapInspector');
  const inspectorValue = document.getElementById('inspectorValue');
  const inspectorLabel = document.getElementById('inspectorLabel');

  inspectorValue.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  inspector.classList.add('visible');

  const point = ee.Geometry.Point([e.latlng.lng, e.latlng.lat]);
  const dsKey = document.getElementById('dataset').value;
  const bandName = DATASETS[dsKey].supportsNdvi ? 'NDVI' : 'value';

  try {
    const dict = await currentDisplayImage.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: map.getZoom() > 10 ? DATASETS[dsKey].scale : DATASETS[dsKey].scale * 5,
    }).getInfo();
    
    if (dict && dict[bandName] !== null) {
      inspectorValue.textContent = dict[bandName].toFixed(4);
      inspectorLabel.textContent = bandName;
    } else {
      inspectorValue.textContent = 'No data';
      inspectorLabel.textContent = 'at point';
    }
  } catch (err) {
    console.error('Inspector error:', err);
    inspectorValue.textContent = 'Error';
  }

  setTimeout(() => inspector.classList.remove('visible'), 4000);
}

async function calculateStats(region, ds, bandName, image) {
    const statImage = ee.Image(image.median()).rename(bandName);
    const meanDict = statImage.reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: ds.scale, maxPixels: 1e13 });
    const meanValueServer = ee.Dictionary(meanDict).get(bandName, null);
    const meanValueClient = await meanValueServer.getInfo();
    document.getElementById('avgNdvi').textContent = (meanValueClient != null) ? meanValueClient.toFixed(3) : '–';
}

async function calculateTrend(collection, region, ds, bandName, computeFunction) {
  const monthly = monthlyTimeSeries(collection, region, ds, bandName, computeFunction);
  const fc = await monthly.getInfo();
  const labels = fc.features.map(f => f.properties.date);
  const values = fc.features.map(f => f.properties.value);
  updateTrend(labels, values);
}

async function calculateNdviClasses(image, region, scale) {
  const classes = await ndviClasses(image, region, scale).getInfo();
  const { low = 0, mod = 0, high = 0, vhigh = 0 } = classes;
  updateAreaChart(['Low','Moderate','High','Very High'], [low, mod, high, vhigh]);
}

/* =========================
  EARTH ENGINE HELPERS
========================= */
function monthlyTimeSeries(collection, region, ds, bandName, computeFunction) {
  const start = ee.Date(document.getElementById('startDate').value);
  const end = ee.Date(document.getElementById('endDate').value);
  const months = end.difference(start, 'month').floor();

  const byMonth = ee.List.sequence(0, months).map(m => {
    const startM = start.advance(ee.Number(m), 'month');
    const endM = startM.advance(1, 'month');
    const monthlyColl = collection.filterDate(startM, endM);
    const size = monthlyColl.size();
    const mean = ee.Algorithms.If(
      size.gt(0),
      ee.Dictionary(
        // Use the new computeFunction here instead of ds.computeImage
        monthlyColl.map(computeFunction).mean().rename(bandName)
        .reduceRegion({ reducer: ee.Reducer.mean(), geometry: region, scale: ds.scale, maxPixels: 1e13 })
      ).get(bandName, null),
      null
    );
    return ee.Feature(null, { date: startM.format('YYYY-MM'), value: mean });
  });

  return ee.FeatureCollection(byMonth);
}

function ndviClasses(image, region, scale) {
    const ndvi = image.rename('NDVI');
    const areaImage = ee.Image.pixelArea();
    const totalArea = ee.Dictionary(areaImage.reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e13 })).get('area', 1);

    const calculateClassArea = (mask) => {
        const area = ee.Dictionary(areaImage.updateMask(mask).reduceRegion({ reducer: ee.Reducer.sum(), geometry: region, scale: scale, maxPixels: 1e13 })).get('area', 0);
        return ee.Number(area).divide(totalArea).multiply(100);
    };
    
    return ee.Dictionary({
        low: calculateClassArea(ndvi.lt(0.2)),
        mod: calculateClassArea(ndvi.gte(0.2).and(ndvi.lt(0.5))),
        high: calculateClassArea(ndvi.gte(0.5).and(ndvi.lt(0.7))),
        vhigh: calculateClassArea(ndvi.gte(0.7))
    });
}

/* =========================
  UI UPDATES
========================= */
function updateGuidance() {
    const signInBtn = document.getElementById('signInBtn');
    const drawBtn = document.getElementById('drawBtn');
    const analyzeBtn = document.getElementById('analyzeBtn');

    [signInBtn, drawBtn, analyzeBtn].forEach(btn => btn.classList.remove('btn-guidance'));

    if (!eeAuthorized) {
        signInBtn.classList.add('btn-guidance');
    } else if (drawnItems.getLayers().length === 0) {
        drawBtn.classList.add('btn-guidance');
    } else {
        analyzeBtn.classList.add('btn-guidance');
    }
}

function updateTrend(labels, values) {
  trendChart.data.labels = labels;
  trendChart.data.datasets[0].data = values.map(v => v == null ? null : Number(v.toFixed(3)));
  trendChart.update();
}

function updateAreaChart(labels, values) {
  areaChart.data.labels = labels;
  areaChart.data.datasets[0].data = values.map(v => v == null ? null : Number(v.toFixed(1)));
  areaChart.update();
}

function fitToRegion(geojson) {
  const layer = L.geoJSON(geojson);
  map.fitBounds(layer.getBounds(), { padding: [30, 30] });
}

function renderLegend(items) {
  const root = document.getElementById('legend');
  root.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'legend-palette';
  items.forEach(it => {
    const el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML = `<span class="legend-swatch" style="background:${it.c}"></span><span>${it.t}</span>`;
    wrap.appendChild(el);
  });
  root.appendChild(wrap);
}

async function downloadPng() {
    const downloadBtn = document.getElementById('downloadPng');
    const originalText = downloadBtn.querySelector('span').textContent;
    downloadBtn.querySelector('span').textContent = 'Generating...';
    downloadBtn.disabled = true;
    try {
        const card = document.getElementById('mainContent');
        showToast('Generating PNG report...', 'success');
        const elementsToHide = document.querySelectorAll('#toastContainer, .leaflet-control, #sidebarToggle');
        elementsToHide.forEach(el => el.style.visibility = 'hidden');
        const canvas = await html2canvas(card, {
            useCORS: true, allowTaint: true, backgroundColor: '#030712', scale: 2, logging: false,
            onclone: (clonedDoc) => {
                const footer = clonedDoc.createElement('div');
                footer.style = 'position: absolute; bottom: 20px; right: 20px; font-size: 12px; color: #94a3b8;';
                footer.textContent = `Generated on ${new Date().toLocaleString()} by ${currentUser?.name || 'User'}`;
                clonedDoc.getElementById('mainContent').appendChild(footer);
            }
        });
        elementsToHide.forEach(el => el.style.visibility = 'visible');
        const a = document.createElement('a');
        a.download = `geomatrix-insights-${new Date().toISOString().slice(0,10)}.png`;
        a.href = canvas.toDataURL('image/png');
        a.click();
    } finally {
        downloadBtn.querySelector('span').textContent = originalText;
        downloadBtn.disabled = false;
    }
}

function setLoading(isLoading) {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const analyzeBtnText = document.getElementById('analyzeBtnText');
  const analyzeSpinner = document.getElementById('analyzeSpinner');
  const gridContainer = document.getElementById('gridContainer');
  analyzeBtn.disabled = isLoading;
  
  if (isLoading) {
    analyzeBtnText.textContent = 'Processing...';
    analyzeSpinner.classList.remove('hidden');
    gridContainer.classList.add('is-analyzing');
  } else {
    analyzeBtnText.textContent = 'Analyze';
    analyzeSpinner.classList.add('hidden');
    gridContainer.classList.remove('is-analyzing');
    updateGuidance();
  }
}

function setMapLoading(isLoading) {
  const mapElement = document.getElementById('map');
  const existingLoader = mapElement.querySelector('.map-loader');
  if (isLoading && !existingLoader) {
    mapElement.insertAdjacentHTML('beforeend', '<div class="map-loader absolute inset-0 bg-dark-900/50 flex items-center justify-center z-20"><i class="fas fa-satellite-dish text-primary-400 text-4xl animate-spin-slow"></i></div>');
  } else if (!isLoading && existingLoader) {
    existingLoader.remove();
  }
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = { success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' }[type] || 'fa-info-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 4000);
}

function onEeError(err) {
  console.error('Earth Engine Error:', err);
  const errorMessage = (err && err.message) ? err.message : String(err);
  let message = 'An Earth Engine error occurred.';
  if (errorMessage.includes('Quota')) message = 'API quota exceeded. Please try again later.';
  else if (errorMessage.includes('No images match')) message = 'No data available for the selected parameters.';
  else if (errorMessage.includes('Geometry')) message = 'Invalid area selection. Please draw a new polygon.';
  else if (errorMessage.includes('cloudy')) message = 'Could not compute stats. The area might be too cloudy.';
  showToast(message, 'error');
}

function validateDateRange(datasetKey, startDate, endDate) {
  const maxDays = DATASETS[datasetKey].maxDays;
  const daysDiff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
  
  if (datasetKey === 'JRC_WATER') return true;
  
  return daysDiff <= maxDays;
}

async function cachedEeRequest(key, requestFunction) {
  if (requestCache.has(key)) return requestCache.get(key);
  const result = await requestFunction();
  requestCache.set(key, result);
  setTimeout(() => requestCache.delete(key), 300000);
  return result;
}

/* =========================
  INITIALIZE APP
========================= */
window.onload = () => {
  initUI();
  initAuthAndListeners();
};