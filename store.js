/**
 * ==========================================================================
 * MODA Luxury Storefront Logic (store.js)
 * Real-Time Supabase Database & Public Storage Bucket Integration
 * Project Reference: pnbozvyqautludmogpjs
 * Tables Active: stores, garments, leads, platform_settings
 * Storage Bucket: garment-images (Public)
 * ==========================================================================
 */

const FREE_BETA_NOTICE = Object.freeze({
    language: 'en',
    messages: Object.freeze({
        en: 'Free beta: virtual try-on is free here. You may wait a few seconds in a short line, and each person gets a limited number of tries. You do NOT need to pay anything. Ignore the VIP upgrade offer.',
        so: 'Tijaabo bilaash ah: tijaabinta dharka waa bilaash. Waxaa laga yaabaa inaad sugto dhowr ilbiriqsi, qof walbana waxa u furan tiro xaddidan oo tijaabo ah. Looma baahna inaad bixiso lacag. Iska dhaaf bixinta VIP.'
    })
});
const GOBSTORE_OWNER_WHATSAPP = '252636647941';
let leadGateHasBeenPassed = false;

function getFreeBetaNoticeText() {
    return FREE_BETA_NOTICE.messages[FREE_BETA_NOTICE.language] || FREE_BETA_NOTICE.messages.en;
}

function syncFreeBetaNoticeUi() {
    document.querySelectorAll('.free-beta-inline').forEach(note => {
        note.textContent = getFreeBetaNoticeText();
        note.classList.toggle('is-visible', leadGateHasBeenPassed);
        note.setAttribute('aria-hidden', String(!leadGateHasBeenPassed));
    });
}

function observeLeadGateForBetaNotice() {
    const leadGate = document.getElementById('lead-modal');
    if (!leadGate) return;
    const observer = new MutationObserver(() => {
        const gateIsOpen = leadGate.classList.contains('active') || getComputedStyle(leadGate).display !== 'none';
        if (!gateIsOpen) leadGateHasBeenPassed = true;
        syncFreeBetaNoticeUi();
    });
    observer.observe(leadGate, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('load', () => {
        const gateIsOpen = leadGate.classList.contains('active') || getComputedStyle(leadGate).display !== 'none';
        if (!gateIsOpen) leadGateHasBeenPassed = true;
        syncFreeBetaNoticeUi();
    }, { once: true });
}

observeLeadGateForBetaNotice();

const SUPABASE_PROJECT_REF = 'pnbozvyqautludmogpjs';
const SUPABASE_URL = `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const SUPABASE_DEFAULT_URL = SUPABASE_URL;

// Supabase Anon Public Key for project pnbozvyqautludmogpjs (from Settings -> API)
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBuYm96dnlxYXV0bHVkbW9ncGpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE0ODkyNzksImV4cCI6MjEwNzA2NTI3OX0.BZu7DURgeM5eoF-AfeGxRDchjfJnhgD6W0kq3OMNn9I';
const SUPABASE_DEFAULT_ANON_KEY = SUPABASE_ANON_KEY;
const SUPABASE_STORAGE_BUCKET = 'garment-images';
const SUPABASE_STORAGE_BASE_URL = `${SUPABASE_DEFAULT_URL}/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;

// Use existing global supabase instance from CDN or create helper
function getSupabaseClient() {
    if (typeof window !== 'undefined' && window._supabaseClient) return window._supabaseClient;
    const sdk = (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function')
        ? supabase
        : (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function' ? window.supabase : null);

    if (sdk && typeof sdk.createClient === 'function') {
        const client = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        if (typeof window !== 'undefined') {
            window._supabaseClient = client;
        }
        return client;
    }
    return null;
}

/**
 * Format raw phone input into strict E.164 standard.
 * Default Somaliland/Somalia country code (+252) if not prefixed.
 */
function formatToE164(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
    }
    if (!cleaned.startsWith('+')) {
        if (cleaned.startsWith('252')) {
            cleaned = '+' + cleaned;
        } else if (cleaned.startsWith('0')) {
            cleaned = '+252' + cleaned.slice(1);
        } else if (cleaned.length === 9 || cleaned.length === 8 || cleaned.length === 7) {
            cleaned = '+252' + cleaned;
        } else {
            cleaned = '+' + cleaned;
        }
    }
    return cleaned;
}

/**
 * Real-time WhatsApp phone verification via Supabase Edge Function ('verify-ekyc').
 * Returns { verified: boolean, registered: boolean|null, checkId: string|null, formattedPhone: string, isFallback?: boolean, error?: string }
 */
async function verifyWhatsAppPhoneEkyc(rawPhone) {
    const formattedPhone = formatToE164(rawPhone);
    const client = getSupabaseClient();
    try {
        if (!client || !client.functions) {
            return { verified: false, registered: null, checkId: null, formattedPhone, isFallback: true, error: 'Supabase client or Edge Functions not available' };
        }
        const { data, error } = await client.functions.invoke('verify-ekyc', {
            body: { phone: formattedPhone }
        });
        if (error || !data) {
            return { verified: false, registered: null, checkId: null, formattedPhone, isFallback: true, error: error?.message || 'Invocation failed' };
        }
        return { ...data, formattedPhone };
    } catch (err) {
        return { verified: false, registered: null, checkId: null, formattedPhone, isFallback: true, error: err.message };
    }
}

// Active Store Constants & State
function isValidUUID(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getValidStoreId(candidateId) {
    if (isValidUUID(candidateId)) return candidateId;
    if (currentShop && isValidUUID(currentShop.id)) return currentShop.id;
    return null;
}

let currentShop = {
    id: null,
    name: 'gobstore',
    phone: `+${GOBSTORE_OWNER_WHATSAPP}`,
    owner_whatsapp: `+${GOBSTORE_OWNER_WHATSAPP}`,
    accentColor: '#c49a6c'
};
let storeGarments = [];
let allStoreGarments = []; // Cached copy for category filtering
let fullCatalogLoaded = false;

// --- URL Parameter Extraction (store_id & garment_id focus) ---
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        shopId: params.get('shop') || params.get('shop_id') || params.get('store_id') || params.get('store'),
        garmentId: params.get('garment') || params.get('garment_id') || params.get('item_id') || params.get('ref'),
        productId: params.get('product') || params.get('item') || params.get('id')
    };
}

function getFocusedProductId() {
    const { productId, garmentId } = getUrlParams();
    return productId || garmentId || null;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/** Strip characters that break PostgREST `.or()` / `.ilike()` filter strings. */
function sanitizePostgrestValue(value) {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

/**
 * Only UUID shop ids are safe to send as `.eq` / `.or` filters.
 * Slugs are sanitized for `ilike` name lookups and never interpolated raw.
 */
function getSafeShopFilter(rawShopId) {
    const raw = typeof rawShopId === 'string' ? rawShopId.trim() : '';
    if (!raw) return { uuid: null, name: null };
    if (isValidUUID(raw)) return { uuid: raw, name: null };
    const name = sanitizePostgrestValue(raw);
    return { uuid: null, name: name || null };
}

// Convert image filename/path into valid Supabase public storage URL
function resolveGarmentImageUrl(rawImage, category = 'Apparel') {
    if (!rawImage) {
        return 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600';
    }
    if (rawImage.startsWith('http://') || rawImage.startsWith('https://') || rawImage.startsWith('data:')) {
        return rawImage;
    }
    // If it's a filename in garment-images bucket, ensure gobsrote/ prefix if not already present
    let cleanFileName = rawImage.replace(/^\/+/, '');
    if (!cleanFileName.startsWith('gobsrote/') && (cleanFileName.endsWith('.jfif') || cleanFileName.includes('sheo') || cleanFileName.includes('shirt') || cleanFileName.includes('pants'))) {
        cleanFileName = 'gobsrote/' + cleanFileName;
    }
    return `${SUPABASE_STORAGE_BASE_URL}${cleanFileName}`;
}

// Anon storefront must not upsert stores (RLS 401/403). Keep in-memory GOBSTORE defaults.

// Helper: Filter out any footwear or shoe items
function isFootwearItem(item) {
    if (!item) return false;
    const cat = String(item.category || '').toLowerCase();
    const title = String(item.title || item.name || '').toLowerCase();
    const file = String(item.file || item.image_url || item.image || item.photo || '').toLowerCase();
    return (
        cat.includes('footwear') ||
        cat.includes('shoe') ||
        cat.includes('sneaker') ||
        cat.includes('boot') ||
        cat.includes('loafer') ||
        title.includes('shoe') ||
        title.includes('oxford') ||
        title.includes('footwear') ||
        title.includes('leather shoe') ||
        title.includes('loafer') ||
        file.includes('shoe')
    );
}

// --- Dynamic Store Branding Fetcher strictly from Supabase (No localStorage for stores) ---
async function initShopBranding() {
    const { shopId } = getUrlParams();
    const client = getSupabaseClient();

    if (client) {
        try {
            const shopFilter = getSafeShopFilter(shopId);
            let query = client.from('stores').select('*');
            if (shopFilter.uuid) {
                query = query.eq('id', shopFilter.uuid);
            } else if (shopFilter.name) {
                query = query.eq('slug', shopFilter.name);
            } else {
                query = query.ilike('name', '%gobstore%');
            }
            let { data, error } = await query;
            if ((!data || data.length === 0) && shopFilter.name) {
                const byName = await client.from('stores').select('*').ilike('name', shopFilter.name);
                if (!byName.error) {
                    data = byName.data;
                    error = null;
                }
            }
            if (!error && Array.isArray(data) && data.length > 0) {
                const found = data[0];
                currentShop = {
                    id: found.id,
                    name: found.name,
                    phone: found.owner_whatsapp || found.phone || `+${GOBSTORE_OWNER_WHATSAPP}`,
                    owner_whatsapp: found.owner_whatsapp || found.phone || `+${GOBSTORE_OWNER_WHATSAPP}`,
                    accentColor: found.accent_color || '#c49a6c'
                };
            }
        } catch (e) {
            console.warn('Supabase store query fallback:', e);
        }
    }

    // Update DOM Branding Elements
    const logoEl = document.getElementById('store-brand-logo');
    const footerLogo = document.getElementById('footer-brand-title');
    const gateTitle = document.getElementById('gate-store-title');

    const brandDisplayName = (currentShop.name || 'GOBSTORE').toUpperCase();
    if (logoEl) logoEl.textContent = brandDisplayName;
    if (footerLogo) footerLogo.textContent = brandDisplayName;
    if (gateTitle) gateTitle.textContent = `Welcome to ${brandDisplayName}`;
    document.title = `${brandDisplayName} — Luxury Storefront`;
}

// --- Dynamic Garments Fetcher from Supabase Database & Public Storage ---
async function resolveStoreId(rawShopId = null) {
    const filter = getSafeShopFilter(rawShopId);
    if (filter.uuid) return filter.uuid;
    if (filter.name) {
        const { data, error } = await getSupabaseClient().from('stores').select('id').eq('slug', filter.name).maybeSingle();
        if (!error && data && isValidUUID(data.id)) return data.id;
        const byName = await getSupabaseClient().from('stores').select('id').ilike('name', filter.name).maybeSingle();
        if (!byName.error && byName.data && isValidUUID(byName.data.id)) return byName.data.id;
        return null;
    }
    return isValidUUID(currentShop.id) ? currentShop.id : null;
}

function mapStoreGarment(row) {
    const imageUrls = Array.isArray(row.image_urls) ? row.image_urls : [];
    const image = resolveGarmentImageUrl(row.image_url || imageUrls[0] || row.image || row.img_url || row.photo);
    const price = Number(row.price);
    return {
        id: String(row.id), dbId: row.id,
        storeId: row.store_id || row.shop_id || currentShop.id,
        title: row.title || row.name || 'Garment',
        description: row.description || '',
        category: row.category || 'Apparel',
        price: Number.isFinite(price) ? price : 0,
        originalPrice: row.original_price ? Number(row.original_price) : null,
        discount: row.discount || null,
        rating: row.rating ? Number(row.rating) : 4.9,
        reviews: row.reviews ? Number.parseInt(row.reviews, 10) : 0,
        colors: Array.isArray(row.colors) ? row.colors : [],
        image,
        imageUrls: imageUrls.length ? imageUrls.map(resolveGarmentImageUrl) : [image],
        tryOnEnabled: row.try_on_enabled !== false && row.ar_ready !== false,
        anywearModelId: row.anywear_model_id || row.id,
        arUrl: row.ar_url || null
    };
}

async function fetchAndRenderGarments({ fullCatalog = false } = {}) {
    const container = document.getElementById('store-products-grid');
    if (!container) return false;
    const client = getSupabaseClient();
    if (!client) {
        container.innerHTML = '<p class="catalog-message">The catalog is temporarily unavailable.</p>';
        return false;
    }

    const focusedProductId = getFocusedProductId();
    const singleItemMode = Boolean(focusedProductId && !fullCatalog);
    container.innerHTML = '<p class="catalog-message">Loading the store catalog…</p>';
    try {
        let query = client.from('garments').select('*').eq('is_active', true);
        if (singleItemMode) {
            if (!isValidUUID(String(focusedProductId))) {
                container.innerHTML = '<p class="catalog-message">This product link is invalid or expired.</p>';
                storeGarments = [];
                allStoreGarments = [];
                return false;
            }
            const explicitShop = getUrlParams().shopId;
            if (explicitShop) {
                const storeId = await resolveStoreId(explicitShop);
                if (!storeId) throw new Error('This product link refers to an unknown store.');
                query = query.eq('store_id', storeId);
            }
            query = query.eq('id', focusedProductId).maybeSingle();
        } else {
            const storeId = await resolveStoreId(getUrlParams().shopId);
            if (!storeId) throw new Error('Store not found. Open a store link with a valid store ID or slug.');
            currentShop.id = storeId;
            query = query.eq('store_id', storeId).order('created_at', { ascending: false });
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = singleItemMode ? (data ? [data] : []) : (Array.isArray(data) ? data : []);
        storeGarments = rows.filter(row => !isFootwearItem(row)).map(mapStoreGarment);
        allStoreGarments = [...storeGarments];
        if (!singleItemMode) fullCatalogLoaded = true;
        renderStoreProducts();
        if (singleItemMode && storeGarments.length === 0) {
            container.innerHTML = '<p class="catalog-message">This garment could not be found or is no longer available.</p>';
        }
        return true;
    } catch (error) {
        console.error('Supabase catalog request failed:', error);
        container.innerHTML = `<p class="catalog-message">${escapeHtml(error.message || 'Unable to load the catalog. Please try again.')}</p>`;
        storeGarments = [];
        allStoreGarments = [];
        return false;
    }
}
// --- Update Product Schema for Anywear / Decart Scanner ---
function updateProductJsonLd(garments) {
    try {
        let script = document.getElementById('decart-product-schema');
        if (!script) {
            script = document.createElement('script');
            script.id = 'decart-product-schema';
            script.type = 'application/ld+json';
            document.head.appendChild(script);
        }
        const list = (Array.isArray(garments) ? garments : []).filter(item => item.tryOnEnabled !== false && item.try_on_enabled !== false);
        const graph = list.map(item => ({
            '@type': 'Product',
            'name': item.title,
            'image': item.image,
            'description': item.description || `${item.title} — GOBSTORE apparel`,
            'category': item.category || 'Apparel',
            'offers': {
                '@type': 'Offer',
                'price': String(item.price || '49.99'),
                'priceCurrency': 'USD'
            }
        }));
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': graph
        });
    } catch (e) {
        console.warn('JSON-LD update notice:', e);
    }
}

// --- Force Anywear / Decart Widget to Scan and Render Mobile Badges ---
function pingAnywearScanner() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
    document.dispatchEvent(new Event('visibilitychange'));
    try {
        if (window.Anywear && typeof window.Anywear.refresh === 'function') window.Anywear.refresh();
        else if (window.Anywear && typeof window.Anywear.scan === 'function') window.Anywear.scan();
        else if (window.Anywear && typeof window.Anywear.init === 'function') window.Anywear.init();
    } catch (e) {}
}

function notifyAnywearDOMUpdate() {
    if (typeof window === 'undefined') return;

    pingAnywearScanner();

    const images = document.querySelectorAll('#store-products-grid img, #spotlight-container img, #featured-product-modal img');
    images.forEach(img => {
        if (!img.complete) {
            img.addEventListener('load', pingAnywearScanner, { once: true });
        }
    });

    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
            pingAnywearScanner();
            requestAnimationFrame(pingAnywearScanner);
        });
    }

    setTimeout(pingAnywearScanner, 200);
    setTimeout(pingAnywearScanner, 600);
    setTimeout(pingAnywearScanner, 1200);
}

// --- Render Product Cards Dynamically ---
function renderStoreProducts() {
    const container = document.getElementById('store-products-grid');
    if (!container) return;

    if (storeGarments.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: #888;">
                <i class="fa-solid fa-shirt" style="font-size: 32px; color: #ccc; margin-bottom: 12px;"></i>
                <p style="font-size: 14px; font-weight: 700; color: #222;">No active garments are available.</p>
            </div>
        `;
        updateProductJsonLd([]);
        notifyAnywearDOMUpdate();
        syncFreeBetaNoticeUi();
        return;
    }

    const { garmentId } = getUrlParams();

    container.innerHTML = storeGarments.map(item => {
        const isTarget = (garmentId && (String(item.id) === String(garmentId) || item.title.toLowerCase().includes(garmentId.toLowerCase())));
        const waMessage = encodeURIComponent(`Hi ${currentShop.name}, I am interested in ordering/trying on: ${item.title} ($${item.price.toFixed(2)}).`);
        const waLink = `https://wa.me/${GOBSTORE_OWNER_WHATSAPP}?text=${waMessage}`;
        const modelId = item.anywearModelId || item.id;
        const enabled = item.tryOnEnabled !== false;
        const safeTitle = escapeHtml(item.title);
        const safeCategory = escapeHtml(item.category);
        const safeImage = escapeHtml(item.image);

        return `
        <div id="product-card-${escapeHtml(item.id)}" class="product-card ${isTarget ? 'garment-focused' : ''}" data-product-id="${escapeHtml(item.id)}" data-model-id="${enabled ? escapeHtml(modelId) : ''}" data-try-on-enabled="${enabled}">
            <div class="product-img-wrap" style="position: relative;">
                ${item.discount ? `<span class="discount-badge">${item.discount}</span>` : ''}

                <button class="wishlist-btn" title="Add to Wishlist" onclick="event.stopPropagation(); this.classList.toggle('active')">
                    <i class="fa-regular fa-heart"></i>
                </button>

                <img src="${safeImage}" alt="${safeTitle}" loading="eager" decoding="async" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600'">
            </div>
            <p class="free-beta-inline" aria-hidden="true"></p>

            <div class="product-info">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #c49a6c; margin-bottom: 4px;">
                    ${safeCategory}
                </div>

                <h3 class="product-title" title="${safeTitle}">${safeTitle}</h3>
                
                <div class="price-row">
                    <span class="current-price">$${item.price.toFixed(2)}</span>
                    ${item.originalPrice ? `<span class="original-price">$${item.originalPrice.toFixed(2)}</span>` : ''}
                </div>

                <div class="rating-row">
                    <div class="stars">
                        <i class="fa-solid fa-star"></i>
                        <i class="fa-solid fa-star"></i>
                        <i class="fa-solid fa-star"></i>
                        <i class="fa-solid fa-star"></i>
                        <i class="fa-solid fa-star-half-stroke"></i>
                    </div>
                    <span class="review-count">(${item.reviews})</span>
                </div>

                <div class="color-dots">
                    ${item.colors.map(c => `<span class="color-dot" style="background-color: ${c}"></span>`).join('')}
                </div>

                <a href="${waLink}" target="_blank" onclick="event.stopPropagation()" class="whatsapp-inquire-btn">
                    <i class="fa-brands fa-whatsapp"></i> Inquire on WhatsApp
                </a>
            </div>
        </div>
        `;
    }).join('');

    updateProductJsonLd(storeGarments.filter(item => item.tryOnEnabled));
    notifyAnywearDOMUpdate();
    syncFreeBetaNoticeUi();
}

// ==========================================================================
// Lead Capture Gate & Display Logic
// ==========================================================================

function ensureFeaturedProductModal() {
    let modal = document.getElementById('featured-product-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'featured-product-modal';
    modal.className = 'featured-product-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <div class="featured-product-backdrop" data-featured-close="true"></div>
        <div class="featured-product-dialog product-card" role="dialog" aria-modal="true" aria-labelledby="featured-product-title">
            <div class="featured-product-scroll">
                <button type="button" class="featured-product-close" aria-label="Close product preview" data-featured-close="true">&times;</button>
                <div class="featured-product-image-wrap product-img-wrap">
                    <img id="featured-product-image" src="" alt="" loading="eager" decoding="async">
                    <div class="modal-anywear-wrap" data-anywear="true"></div>
                </div>
                <p class="free-beta-inline featured-product-beta-note" aria-hidden="true"></p>
                <div class="featured-product-details">
                    <p id="featured-product-category" class="featured-product-category"></p>
                    <h2 id="featured-product-title"></h2>
                    <p id="featured-product-description" class="featured-product-description"></p>
                    <p id="featured-product-price" class="featured-product-price"></p>
                    <a id="featured-product-whatsapp" class="whatsapp-inquire-btn" target="_blank" rel="noopener">
                        <i class="fa-brands fa-whatsapp"></i> Inquire on WhatsApp
                    </a>
                    <button type="button" class="featured-product-explore" data-featured-explore="true">
                        Explore Full Store / View All Products
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', event => {
        if (event.target.closest('[data-featured-close="true"]')) {
            closeFeaturedProductModal();
            if (getFocusedProductId()) void showFullCatalog();
        } else if (event.target.closest('[data-featured-explore="true"]')) {
            void showFullCatalog();
        }
    });
    return modal;
}

function closeFeaturedProductModal() {
    const modal = document.getElementById('featured-product-modal');
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('featured-product-modal-open');
}

function showFeaturedProductModal(productId) {
    const targetGarment = storeGarments.find(g =>
        String(g.id) === String(productId) ||
        (g.title && g.title.toLowerCase().includes(String(productId).toLowerCase()))
    );
    if (!targetGarment) {
        showFullCatalog();
        return;
    }

    const modal = ensureFeaturedProductModal();
    const image = modal.querySelector('#featured-product-image');
    const imageWrap = modal.querySelector('.featured-product-image-wrap');
    const category = modal.querySelector('#featured-product-category');
    const title = modal.querySelector('#featured-product-title');
    const description = modal.querySelector('#featured-product-description');
    const price = modal.querySelector('#featured-product-price');
    const whatsapp = modal.querySelector('#featured-product-whatsapp');
    const fallbackImage = 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=900';

    const tryOnEnabled = targetGarment.tryOnEnabled !== false;
    const tryOnWrap = modal.querySelector('.modal-anywear-wrap');
    imageWrap.dataset.tryOnEnabled = String(tryOnEnabled);
    imageWrap.dataset.productId = tryOnEnabled ? targetGarment.id : '';
    imageWrap.dataset.modelId = tryOnEnabled ? (targetGarment.anywearModelId || targetGarment.id) : '';
    tryOnWrap.hidden = !tryOnEnabled;
    tryOnWrap.dataset.productId = tryOnEnabled ? targetGarment.id : '';
    tryOnWrap.dataset.modelId = tryOnEnabled ? (targetGarment.anywearModelId || targetGarment.id) : '';
    image.src = targetGarment.image || fallbackImage;
    image.alt = targetGarment.title;
    image.onerror = () => {
        image.onerror = null;
        image.src = fallbackImage;
    };
    category.textContent = targetGarment.category || 'Apparel';
    title.textContent = targetGarment.title;
    description.textContent = targetGarment.description || `Premium ${targetGarment.category || 'apparel'}.`;
    price.textContent = `$${targetGarment.price.toFixed(2)}`;
    const waMessage = encodeURIComponent(`Hi ${currentShop.name}, I am interested in ordering/trying on: ${targetGarment.title} ($${targetGarment.price.toFixed(2)}).`);
    whatsapp.href = `https://wa.me/${GOBSTORE_OWNER_WHATSAPP}?text=${waMessage}`;

    // Keep the modal card machine-readable for Anywear's product scanner.
    const dialog = modal.querySelector('.featured-product-dialog');
    dialog.dataset.productId = tryOnEnabled ? targetGarment.id : '';
    dialog.dataset.modelId = tryOnEnabled ? (targetGarment.anywearModelId || targetGarment.id) : '';
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('featured-product-modal-open');
    notifyAnywearDOMUpdate();
    syncFreeBetaNoticeUi();
    setTimeout(notifyAnywearDOMUpdate, 400);
}

function bindProductFocusHandlers() {
    const container = document.getElementById('store-products-grid');
    if (!container || container.dataset.focusHandlersBound === 'true') return;
    container.dataset.focusHandlersBound = 'true';
    container.addEventListener('click', event => {
        if (event.target.closest('a, button, input, select, textarea')) return;
        const card = event.target.closest('.product-card');
        if (card && card.dataset.productId) showFeaturedProductModal(card.dataset.productId);
    });
}

// Render Scanned Garment Spotlight View (Requirement: Scanned Garment Spotlight View)
function renderSpotlightView(garmentId) {
    const spotlightSection = document.getElementById('garment-spotlight-section');
    const spotlightContainer = document.getElementById('spotlight-container');
    const productsSection = document.getElementById('products');
    const heroSection = document.getElementById('hero');

    if (!spotlightSection || !spotlightContainer) return;

    const targetGarment = storeGarments.find(g => 
        String(g.id) === String(garmentId) || 
        (g.title && g.title.toLowerCase().includes(String(garmentId).toLowerCase()))
    );

    if (!targetGarment) {
        // Fallback if garment ID isn't found: show full catalog
        showFullCatalog();
        return;
    }

    // Hide general product grid and hero banner to place laser focus on scanned item
    if (productsSection) productsSection.style.display = 'none';
    if (heroSection) heroSection.style.display = 'none';

    const waMessage = encodeURIComponent(`Hi ${currentShop.name}, I am interested in ordering: ${targetGarment.title} ($${targetGarment.price.toFixed(2)}).`);
    const waLink = `https://wa.me/${GOBSTORE_OWNER_WHATSAPP}?text=${waMessage}`;

    // Render ONLY the scanned garment prominently (clean UI: image, title, price, no custom try-on buttons)
    // The official Anywear live widget will automatically recognize and overlay on the image.
    spotlightContainer.innerHTML = `
        <div class="spotlight-card" style="width: 100%; max-width: 480px; margin: 0 auto; text-align: center;">
            <div style="font-size: 11px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; color: #c49a6c; margin-bottom: 8px;">
                Scanned Collection Item
            </div>
            
            <h1 style="font-size: 26px; font-weight: 800; color: #111111; margin-bottom: 8px; line-height: 1.25;">
                ${targetGarment.title}
            </h1>
            
            <p style="font-size: 20px; font-weight: 800; color: #111111; margin-bottom: 24px;">
                $${targetGarment.price.toFixed(2)}
            </p>

            <div class="product-img-wrap" data-product-id="${escapeHtml(targetGarment.id)}" data-model-id="${escapeHtml(targetGarment.anywearModelId || targetGarment.id)}" style="width: 100%; height: auto; min-height: 240px; border-radius: 20px; overflow: visible; box-shadow: 0 10px 30px rgba(0,0,0,0.08); background: #f8f8f8; position: relative;">
                <img id="spotlight-garment-image" 
                     src="${targetGarment.image}" 
                     alt="${targetGarment.title}" 
                     style="width: 100%; height: auto; max-height: 520px; object-fit: cover; display: block;"
                     onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600'">
            </div>
            <p class="free-beta-inline" aria-hidden="true"></p>

            <div style="margin-top: 20px;">
                <a href="${waLink}" target="_blank" class="whatsapp-inquire-btn" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; border-radius: 12px; font-size: 13px; font-weight: 700; text-decoration: none;">
                    <i class="fa-brands fa-whatsapp"></i> Inquire on WhatsApp
                </a>
            </div>
        </div>
    `;

    spotlightSection.style.display = 'block';
    spotlightSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    notifyAnywearDOMUpdate();
    syncFreeBetaNoticeUi();
}

// "View Full Catalog" Toggle Action
async function showFullCatalog() {
    if (!fullCatalogLoaded) {
        const loaded = await fetchAndRenderGarments({ fullCatalog: true });
        if (!loaded) return;
    }
    const url = new URL(window.location.href);
    ['garment', 'garment_id', 'item_id', 'ref', 'product', 'item', 'id'].forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    closeFeaturedProductModal();
    const spotlightSection = document.getElementById('garment-spotlight-section');
    const productsSection = document.getElementById('products');
    const heroSection = document.getElementById('hero');

    if (spotlightSection) spotlightSection.style.display = 'none';
    if (heroSection) heroSection.style.display = 'block';
    if (productsSection) {
        productsSection.style.display = 'block';
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    notifyAnywearDOMUpdate();
}

// ==========================================================================
// Lead Capture Gate & 3D Virtual Try-On Session Engine (eKYC Pro Integrated)
// ==========================================================================
async function submitLeadGate(e) {
    e.preventDefault();
    const nameInput = document.getElementById('lead-name');
    const phoneInput = document.getElementById('lead-phone');
    const submitBtn = document.getElementById('lead-submit-btn');
    const statusMsg = document.getElementById('lead-status-msg');

    const name = nameInput ? nameInput.value.trim() : '';
    const rawPhone = phoneInput ? phoneInput.value.trim() : '';

    if (!name || !rawPhone) return;

    // UI Helper: show validation status message
    function setStatus(msg, type = 'info') {
        if (!statusMsg) return;
        statusMsg.style.display = 'block';
        if (type === 'error') {
            statusMsg.style.background = '#fef2f2';
            statusMsg.style.color = '#dc2626';
            statusMsg.style.border = '1px solid #fecaca';
        } else if (type === 'success') {
            statusMsg.style.background = '#f0fdf4';
            statusMsg.style.color = '#16a34a';
            statusMsg.style.border = '1px solid #bbf7d0';
        } else {
            statusMsg.style.background = '#f8fafc';
            statusMsg.style.color = '#475569';
            statusMsg.style.border = '1px solid #e2e8f0';
        }
        statusMsg.innerHTML = msg;
    }

    // Local Somaliland format validation for temporary storefront testing.
    // Strip only the requested separators, then accept these exact formats.
    const sanitizedPhone = rawPhone.replace(/[\s-]/g, '').replace(/^\++/, '');
    const somalilandPhonePattern = /^(25263\d{7}|063\d{7}|63\d{7})$/;
    if (!somalilandPhonePattern.test(sanitizedPhone)) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.innerHTML = '<span>Unlock Storefront & Try-On →</span>';
        }
        setStatus('Please enter a valid Somaliland number starting with 063, 63, or 25263.', 'error');
        if (phoneInput) {
            phoneInput.style.borderColor = '#dc2626';
            phoneInput.focus();
        }
        return;
    }

    // Convert the accepted local formats to E.164 before storing the lead.
    const formattedPhone = formatToE164(sanitizedPhone);

    // TEMPORARY LOCAL TEST BYPASS: do not invoke the verify-ekyc Edge Function.
    // Restore verifyWhatsAppPhoneEkyc(formattedPhone) before production use.
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.75';
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Unlocking access...</span>';
    }
    setStatus('<i class="fa-solid fa-check"></i> Local number format accepted. Unlocking test access...', 'success');
    const ekycResult = {
        verified: true,
        registered: true,
        checkId: 'local-test-bypass',
        formattedPhone,
        isFallback: false,
        localTestBypass: true
    };

    // =========================================================================
    // STRICT 3-STATE SUBMIT HANDLER
    // =========================================================================

    // STATE 1: Unregistered (registered === false)
    // STOP form submission. DO NOT save lead. DO NOT close modal. Highlight input red.
    if (ekycResult.registered === false) {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.innerHTML = '<span>Unlock Storefront & Try-On →</span>';
        }
        setStatus('<i class="fa-solid fa-triangle-exclamation"></i> This WhatsApp number is not registered or invalid. Please enter a working WhatsApp number.', 'error');
        if (phoneInput) {
            phoneInput.style.borderColor = '#dc2626';
            phoneInput.focus();
        }
        return; // Strictly STOP form submission
    }

    // Reset phone input border if valid or fallback
    if (phoneInput) {
        phoneInput.style.borderColor = '#e2e2e2';
    }

    // Determine verification flag
    const isVerifiedWhatsApp = (ekycResult.registered === true);

    if (isVerifiedWhatsApp) {
        // STATE 2: Verified (registered === true)
        setStatus('<i class="fa-solid fa-check"></i> WhatsApp verified! Unlocking VIP access...', 'success');
    } else {
        // STATE 3: Unverified/Fallback (registered === null or isFallback === true)
        setStatus('<i class="fa-solid fa-circle-notch fa-spin"></i> Unlocking access...', 'info');
    }

    // Session Unlocking & Universal Persistence
    localStorage.setItem('gobstore_lead_captured', 'true');
    sessionStorage.setItem('gobstore_lead_captured', 'true');
    sessionStorage.setItem('moda_user_name', name);
    sessionStorage.setItem('moda_user_phone', formattedPhone);

    const { shopId } = getUrlParams();
    const focusedProductId = getFocusedProductId();
    const focusedGarment = storeGarments.find(g => String(g.id) === String(focusedProductId));
    const garmentName = focusedGarment ? focusedGarment.title : 'General Store VIP Access';
    const activeGarmentId = focusedGarment ? focusedGarment.id : (focusedProductId || null);
    const activeStoreId = getValidStoreId(focusedGarment ? focusedGarment.storeId : (currentShop.id || shopId));

    // Smoothly clear blur and close lead modal
    const modal = document.getElementById('lead-modal');
    const mainContent = document.getElementById('main-store-content');

    function unlockVipGate() {
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.remove('gate-active');
        }
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        if (mainContent) {
            mainContent.classList.remove('blurred-gate');
        }
        notifyAnywearDOMUpdate();
    }

    unlockVipGate();
    setTimeout(notifyAnywearDOMUpdate, 400);

    // Post-Submission Display Logic (Spotlight scanned garment or full catalog)
    if (focusedProductId) {
        showFeaturedProductModal(focusedProductId);
    } else {
        showFullCatalog();
    }

    // Activity Telemetry Log
    const now = new Date();
    const dateFormatted = now.toISOString().slice(0, 10) + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let storedLogs = [];
    try {
        const parsedLogs = JSON.parse(localStorage.getItem('labis_logs') || '[]');
        if (Array.isArray(parsedLogs)) storedLogs = parsedLogs;
    } catch (e) {
        console.warn('Lead telemetry cache reset notice:', e);
    }
    storedLogs.unshift({
        id: 'log-' + Date.now(),
        type: 'LEAD',
        message: `${isVerifiedWhatsApp ? 'Verified' : 'Unverified'} WhatsApp Lead: ${name} (${formattedPhone}) — ${isVerifiedWhatsApp ? ('eKYC: ' + (ekycResult.checkId || 'Verified')) : 'Fallback Mode'}`,
        timestamp: dateFormatted,
        status: isVerifiedWhatsApp ? 'success' : 'info'
    });
    localStorage.setItem('labis_logs', JSON.stringify(storedLogs));

    // Save lead with strict whatsapp_verified flag (true for Verified, false for Fallback)
    const newLead = {
        full_name: name,
        whatsapp_number: formattedPhone,
        whatsapp_verified: ekycResult.registered === true,
        ekyc_check_id: ekycResult.checkId || null
    };
    if (activeStoreId && typeof activeStoreId === 'string' && activeStoreId.trim() !== '') {
        newLead.store_id = activeStoreId.trim();
    }

    enqueuePendingLead({
        ...newLead,
        phone: formattedPhone,
        shop_id: activeStoreId || null,
        timestamp: new Date().toISOString(),
        status: 'pending'
    });
    void flushPendingLeads();

    postLeadToWebhook({
        ...newLead,
        shop: currentShop.name,
        garment: garmentName,
        garment_id: activeGarmentId,
        date: dateFormatted
    });
}

// Prioritize or bring target item into focus
function highlightTargetGarment(garmentId) {
    if (!garmentId) return;

    setTimeout(() => {
        const card = document.getElementById(`product-card-${garmentId}`) || document.querySelector('.product-card');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('garment-focused');
        }
    }, 450);
}

// Insert strictly into Supabase database `public.leads` table using full_name, whatsapp_number, store_id (UUID) + eKYC metadata
async function postLeadToSupabase(leadRecord) {
    const client = getSupabaseClient();
    let config = {};
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const parsedConfig = JSON.parse(localStorage.getItem('labis_api_config') || '{}');
            if (parsedConfig && typeof parsedConfig === 'object') config = parsedConfig;
        }
    } catch (e) {
        console.warn('API config cache parse notice:', e);
    }
    const supabaseUrl = config.supabaseUrl || SUPABASE_URL || SUPABASE_DEFAULT_URL;
    const supabaseKey = config.supabaseAnonKey || SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON_KEY;

    // Full payload including eKYC metadata
    const payloadWithMeta = {
        full_name: (leadRecord.full_name || leadRecord.name || '').trim(),
        whatsapp_number: formatToE164(leadRecord.whatsapp_number || leadRecord.phone || ''),
        whatsapp_verified: leadRecord.whatsapp_verified !== undefined ? leadRecord.whatsapp_verified : false,
        ekyc_check_id: leadRecord.ekyc_check_id || null
    };

    // Ensure store_id is only included if non-empty and valid string
    if (leadRecord.store_id && typeof leadRecord.store_id === 'string' && leadRecord.store_id.trim() !== '') {
        payloadWithMeta.store_id = leadRecord.store_id.trim();
    }

    // Minimal payload (in case public.leads schema has strict column constraints without extra columns)
    const basePayload = {
        full_name: payloadWithMeta.full_name,
        whatsapp_number: payloadWithMeta.whatsapp_number
    };
    if (payloadWithMeta.store_id) {
        basePayload.store_id = payloadWithMeta.store_id;
    }

    // 1. Using Supabase JS Client SDK
    if (client) {
        try {
            // Attempt with eKYC metadata columns first
            const { data, error } = await client.from('leads').insert([payloadWithMeta]);
            if (!error) {
                console.log('Lead synced to public.leads with eKYC metadata:', data || payloadWithMeta);
                return true;
            } else if (error && (error.message.includes('column') || error.code === '42703')) {
                // If columns whatsapp_verified or ekyc_check_id do not exist in table schema, fallback to base columns
                console.log('Falling back to standard 3-column lead schema:', error.message);
                const { data: baseData, error: baseErr } = await client.from('leads').insert([basePayload]);
                if (!baseErr) return true;
            } else {
                console.warn('Supabase JS SDK insert notice:', error);
            }
        } catch (e) {
            console.warn('Supabase JS SDK insert exception:', e);
        }
    }

    // 2. Direct REST Fallback
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/leads`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payloadWithMeta)
        });
        if (res.ok) return true;
        if (!res.ok) {
            // Fallback to base columns on REST if schema error
            const baseRes = await fetch(`${supabaseUrl}/rest/v1/leads`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(basePayload)
            });
            return baseRes.ok;
        }
    } catch (err) {
        console.warn('Supabase REST insert notice:', err);
    }

    return false;
}

// --------------------------------------------------------------------------
// Offline lead retry queue
// --------------------------------------------------------------------------
function readPendingLeads() {
    try {
        const parsed = JSON.parse(localStorage.getItem('pending_leads') || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Pending lead queue reset notice:', e);
        return [];
    }
}

function writePendingLeads(leads) {
    try {
        localStorage.setItem('pending_leads', JSON.stringify(leads));
    } catch (e) {
        console.warn('Pending lead queue write notice:', e);
    }
}

function enqueuePendingLead(leadRecord) {
    const pendingLeads = readPendingLeads();
    pendingLeads.push({
        ...leadRecord,
        queue_id: `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        status: 'pending'
    });
    writePendingLeads(pendingLeads);
}

let pendingLeadsFlushPromise = null;

async function flushPendingLeads() {
    if (pendingLeadsFlushPromise) return pendingLeadsFlushPromise;

    pendingLeadsFlushPromise = (async () => {
        const pendingLeads = readPendingLeads();
        if (pendingLeads.length === 0) return;

        const getQueueId = (queuedLead, index) => queuedLead.queue_id || `legacy-${queuedLead.timestamp || 'no-timestamp'}-${index}`;
        const syncedQueueIds = new Set();
        const failedQueueIds = new Set();
        for (const [index, queuedLead] of pendingLeads.entries()) {
            if (!queuedLead || typeof queuedLead !== 'object') continue;

            const queueId = getQueueId(queuedLead, index);
            const synced = await postLeadToSupabase(queuedLead);
            if (!synced) {
                failedQueueIds.add(queueId);
            } else {
                syncedQueueIds.add(queueId);
            }
        }

        // Merge against the latest storage value so a lead submitted while the
        // network request was in flight is never overwritten.
        const latestLeads = readPendingLeads();
        const remainingLeads = latestLeads.filter((queuedLead, index) => {
            if (!queuedLead || typeof queuedLead !== 'object') return false;
            const queueId = getQueueId(queuedLead, index);
            return !syncedQueueIds.has(queueId) || failedQueueIds.has(queueId);
        });
        writePendingLeads(remainingLeads);
    })();

    try {
        return await pendingLeadsFlushPromise;
    } finally {
        pendingLeadsFlushPromise = null;
    }
}

// Webhook Dispatcher
function postLeadToWebhook(leadData) {
    let config = {};
    try {
        const parsedConfig = JSON.parse(localStorage.getItem('labis_api_config') || '{}');
        if (parsedConfig && typeof parsedConfig === 'object') config = parsedConfig;
    } catch (e) {
        console.warn('Webhook config cache parse notice:', e);
    }
    if (config.webhookUrl) {
        try {
            fetch(config.webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(leadData)
            }).catch(err => console.log('Webhook dispatched:', err));
        } catch (e) {}
    }
}

// ==========================================================================
// Official Anywear Live Widget Integration & Compatibility Handlers
// ==========================================================================

/**
 * Official Anywear Live Widget Integration.
 * Script: https://anywear.decart.ai/widget/latest/anywear.js?domain=mo-hakiim.github.io
 * The Anywear widget dynamically injects its native AI Fitting Room button
 * directly onto product cards and spotlight images.
 */
function launchVirtualTryOn(productId, anywearModelId) {
    console.log(`Anywear Live Widget activated for product ${productId || anywearModelId}`);
    if (window.Anywear && typeof window.Anywear.open === 'function') {
        window.Anywear.open({ productId: productId || anywearModelId });
        return true;
    }
    return false;
}

function closeTryOnModal() {
    if (window.Anywear && typeof window.Anywear.close === 'function') {
        window.Anywear.close();
    }
    if (getFocusedProductId()) void showFullCatalog();
}

// Backwards-compatible alias for any legacy call
function openTryOnModal(itemName, arUrl, garmentId = null) {
    return launchVirtualTryOn(garmentId, garmentId);
}

// Global functions attached to window
if (typeof window !== 'undefined') {
    window.launchVirtualTryOn = launchVirtualTryOn;
    window.closeTryOnModal = closeTryOnModal;
    window.openTryOnModal = openTryOnModal;
    window.notifyAnywearDOMUpdate = notifyAnywearDOMUpdate;
}

// Anywear inserts its badge after render. Handle desktop clicks and touch
// pointer starts so the public API opens the matching garment immediately.
const recentTryOnTouchActivations = new WeakMap();
function handleDelegatedTryOnActivation(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const tryOnButton = target?.closest('.try-on-btn, .tryon-badge-btn, .vton-btn, [data-vton]');
    if (!tryOnButton) return;

    const isTouchActivation = event.type === 'touchstart' || (event.type === 'pointerdown' && event.pointerType === 'touch');
    if (event.type === 'pointerdown' && !isTouchActivation) return;
    if (event.type === 'click') {
        const lastTouchActivation = recentTryOnTouchActivations.get(tryOnButton) || 0;
        if (Date.now() - lastTouchActivation < 900) return;
    }

    const productContext = tryOnButton.closest('[data-product-id][data-model-id]') ||
        tryOnButton.closest('.product-card[data-product-id]') ||
        tryOnButton.closest('.product-img-wrap[data-product-id]') ||
        document.querySelector('#featured-product-modal.active .featured-product-dialog[data-product-id]');
    const productId = productContext?.dataset.productId;
    const modelId = productContext?.dataset.modelId || productId;
    if (!productId || productId === 'false') return;

    const opened = launchVirtualTryOn(productId, modelId);
    if (isTouchActivation && opened) {
        recentTryOnTouchActivations.set(tryOnButton, Date.now());
        if (event.cancelable) event.preventDefault();
    }
}

document.addEventListener('click', handleDelegatedTryOnActivation, true);
document.addEventListener('pointerdown', handleDelegatedTryOnActivation, true);
if (typeof window !== 'undefined' && !window.PointerEvent) {
    document.addEventListener('touchstart', handleDelegatedTryOnActivation, { capture: true, passive: false });
}

// Category Filter Helper (Apparel Only)
function filterCategory(cat) {
    if (!fullCatalogLoaded) {
        void showFullCatalog().then(() => {
            if (fullCatalogLoaded) filterCategory(cat);
        });
        return;
    }
    if (!cat || cat === 'ALL') {
        storeGarments = allStoreGarments.filter(g => !isFootwearItem(g));
    } else {
        const filtered = allStoreGarments.filter(g => 
            !isFootwearItem(g) && g.category && g.category.toLowerCase().includes(cat.toLowerCase())
        );
        storeGarments = filtered.length > 0 ? filtered : allStoreGarments.filter(g => !isFootwearItem(g));
    }
    renderStoreProducts();
}

// Handle native click on product card
function handleProductInteraction(garmentId, itemName, anywearModelId) {
    launchVirtualTryOn(garmentId, anywearModelId || garmentId);
}

// Open VIP Lead-Capture Modal and lock/blur content
function openLeadModal(targetGarmentId = null) {
    if (typeof document !== 'undefined' && document.body) {
        document.body.classList.add('gate-active');
    }
    const modal = document.getElementById('lead-modal');
    const mainContent = document.getElementById('main-store-content');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
    if (mainContent) {
        mainContent.classList.add('blurred-gate');
    }
    if (targetGarmentId) {
        window.pendingTryOnGarmentId = targetGarmentId;
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { void flushPendingLeads(); });
}

// Onload Boot — Universal Lead Gate (All Traffic Sources) & Session Persistence
window.onload = async function() {
    void flushPendingLeads();
    await initShopBranding();
    await fetchAndRenderGarments();
    bindProductFocusHandlers();
    document.addEventListener('click', event => {
        const link = event.target.closest('a[href^="#"]');
        if (
            link &&
            link.hash === '#products' &&
            !link.closest('#featured-product-modal') &&
            getFocusedProductId() &&
            !fullCatalogLoaded
        ) {
            void showFullCatalog();
        }
    });

    const focusedProductId = getFocusedProductId();
    
    // 1. Check browser storage for universal lead capture persistence
    const isCaptured = localStorage.getItem('gobstore_lead_captured') === 'true' || sessionStorage.getItem('gobstore_lead_captured') === 'true';

    if (!isCaptured) {
        // Requirement 1: If NOT set, lock/blur product interaction and trigger the VIP Lead-Capture form immediately upon landing
        if (focusedProductId) showFeaturedProductModal(focusedProductId);
        openLeadModal(focusedProductId);
    } else {
        // Requirement 2: Already captured — bypass lead gate completely
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.remove('gate-active');
        }
        const modal = document.getElementById('lead-modal');
        const mainContent = document.getElementById('main-store-content');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
        if (mainContent) {
            mainContent.classList.remove('blurred-gate');
        }

        // Requirement 3: Post-Submission / Session Display Logic
        if (focusedProductId) {
            showFeaturedProductModal(focusedProductId);
        } else {
            showFullCatalog();
        }
    }

    // Trigger Anywear scan sweep after initial boot completion
    notifyAnywearDOMUpdate();
};
