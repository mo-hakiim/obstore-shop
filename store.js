/**
 * ==========================================================================
 * MODA Luxury Storefront Logic (store.js)
 * Real-Time Supabase Database & Public Storage Bucket Integration
 * Project Reference: pnbozvyqautludmogpjs
 * Tables Active: stores, garments, leads, platform_settings
 * Storage Bucket: garment-images (Public)
 * ==========================================================================
 */

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
const GOBSTORE_UUID = 'e0c7a5f1-3d2b-4c8e-9f1a-5b7d6e4c3a2b';

function isValidUUID(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

function getValidStoreId(candidateId) {
    if (isValidUUID(candidateId)) return candidateId;
    if (currentShop && isValidUUID(currentShop.id)) return currentShop.id;
    return GOBSTORE_UUID;
}

let currentShop = {
    id: GOBSTORE_UUID,
    name: 'gobstore',
    phone: '+252634410293',
    owner_whatsapp: '+252634410293',
    accentColor: '#c49a6c'
};
let storeGarments = [];
let allStoreGarments = []; // Cached copy for category filtering

// --- URL Parameter Extraction (store_id & garment_id focus) ---
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        shopId: params.get('shop') || params.get('shop_id') || params.get('store_id') || params.get('store'),
        garmentId: params.get('garment') || params.get('garment_id') || params.get('item_id') || params.get('ref')
    };
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

// --- Seed active store ("gobstore") directly into Supabase stores table ---
async function seedGobstore(client) {
    const seedStore = {
        id: GOBSTORE_UUID,
        name: 'gobstore',
        city: 'Hargeisa',
        owner_whatsapp: '+252634410293'
    };
    if (client) {
        try {
            const { data, error } = await client.from('stores').upsert([seedStore], { onConflict: 'id' }).select();
            if (!error && data && data.length > 0) {
                currentShop.id = data[0].id;
                currentShop.name = data[0].name;
                console.log('Seeded gobstore into Supabase stores table:', data[0]);
                return;
            }
        } catch (e) {
            console.warn('Supabase store seed attempt notice:', e);
        }
    }
    // Direct REST fallback
    const config = JSON.parse(localStorage.getItem('labis_api_config')) || {};
    const supabaseUrl = config.supabaseUrl || SUPABASE_DEFAULT_URL;
    const supabaseKey = config.supabaseAnonKey || SUPABASE_DEFAULT_ANON_KEY;
    try {
        await fetch(`${supabaseUrl}/rest/v1/stores`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(seedStore)
        });
    } catch (err) {}
}

// --- Live Storage Bucket Garments Catalog Definition (Apparel Only) ---
const STORAGE_BUCKET_GARMENTS = [
    { id: 'grm-6', title: 'Tailored Shirt', category: 'Shirts', price: 55.00, file: 'shrit.jfif', anywearModelId: 'grm-6' },
    { id: 'grm-7', title: 'Classic Button-Up Shirt II', category: 'Shirts', price: 58.00, file: 'shirt2.jfif', anywearModelId: 'grm-7' },
    { id: 'grm-8', title: 'Formal Dress Shirt III', category: 'Shirts', price: 62.00, file: 'shirt3.jfif', anywearModelId: 'grm-8' },
    { id: 'grm-9', title: 'Slim Fit Pants', category: 'Pants', price: 65.00, file: 'pants.jfif', anywearModelId: 'grm-9' },
    { id: 'grm-10', title: 'Chino Trousers II', category: 'Pants', price: 68.00, file: 'pants 2.jfif', anywearModelId: 'grm-10' },
    { id: 'grm-11', title: 'Formal Trousers III', category: 'Pants', price: 72.00, file: 'pants3.jfif', anywearModelId: 'grm-11' }
];

// Helper: Filter out any footwear or shoe items
function isFootwearItem(item) {
    if (!item) return false;
    const cat = String(item.category || '').toLowerCase();
    const title = String(item.title || item.name || '').toLowerCase();
    const file = String(item.file || item.image_url || item.image || item.photo || '').toLowerCase();
    const id = String(item.id || '').toLowerCase();

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
        file.includes('sheo') ||
        file.includes('shoe') ||
        ['grm-1', 'grm-2', 'grm-3', 'grm-4', 'grm-5'].includes(id)
    );
}

// --- Seed garments table in Supabase directly from public storage bucket ---
async function syncStorageGarmentsToDatabase(client, storeId = GOBSTORE_UUID) {
    const rows = STORAGE_BUCKET_GARMENTS.map(item => ({
        id: item.id,
        store_id: storeId,
        shop_id: storeId,
        title: item.title,
        category: item.category,
        price: item.price,
        image_url: `${SUPABASE_STORAGE_BASE_URL}gobsrote/${encodeURIComponent(item.file)}`,
        ar_ready: true
    }));

    if (client) {
        try {
            await client.from('garments').delete().in('id', ['grm-1', 'grm-2', 'grm-3', 'grm-4', 'grm-5']);
            await client.from('garments').delete().ilike('category', '%footwear%');
            await client.from('garments').delete().ilike('title', '%shoe%');
        } catch (e) {}

        try {
            const { data, error } = await client.from('garments').upsert(rows, { onConflict: 'id' }).select();
            if (!error && data && data.length > 0) {
                console.log(`Successfully synced ${data.length} garments from storage bucket to public.garments`);
                return data;
            }
        } catch (e) {
            console.warn('Supabase JS garments upsert notice:', e);
        }
    }

    // Direct REST Fallback
    const config = JSON.parse(localStorage.getItem('labis_api_config')) || {};
    const supabaseUrl = config.supabaseUrl || SUPABASE_DEFAULT_URL;
    const supabaseKey = config.supabaseAnonKey || SUPABASE_DEFAULT_ANON_KEY;
    try {
        const res = await fetch(`${supabaseUrl}/rest/v1/garments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'resolution=merge-duplicates,return=representation'
            },
            body: JSON.stringify(rows)
        });
        if (res.ok) {
            const inserted = await res.json();
            return inserted;
        }
    } catch (err) {}

    return rows;
}

// --- Dynamic Store Branding Fetcher strictly from Supabase (No localStorage for stores) ---
async function initShopBranding() {
    const { shopId } = getUrlParams();
    const client = getSupabaseClient();

    // Query store directly from Supabase stores table
    if (client) {
        try {
            let query = client.from('stores').select('*');
            if (shopId) {
                query = query.or(`id.eq.${shopId},name.ilike.%${shopId}%`);
            } else {
                query = query.ilike('name', '%gobstore%');
            }
            const { data, error } = await query;
            if (!error && Array.isArray(data) && data.length > 0) {
                const found = data[0];
                currentShop = {
                    id: found.id,
                    name: found.name,
                    phone: found.owner_whatsapp || found.phone || '+252634410293',
                    owner_whatsapp: found.owner_whatsapp || found.phone || '+252634410293',
                    accentColor: found.accent_color || '#c49a6c'
                };
            } else {
                // If not found in database, seed gobstore directly into stores table
                await seedGobstore(client);
            }
        } catch (e) {
            console.warn('Supabase store query fallback:', e);
            await seedGobstore(client);
        }
    } else {
        await seedGobstore(null);
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
async function fetchAndRenderGarments() {
    const container = document.getElementById('store-products-grid');
    if (!container) return;

    // Show stylish glass skeleton loader
    container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: #888;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; color: #111; margin-bottom: 12px;"></i>
            <p style="font-size: 13px; font-weight: 600;">Loading 3D AR Garment Collection from Cloud Database...</p>
        </div>
    `;

    const client = getSupabaseClient();
    const { shopId, garmentId } = getUrlParams();
    let dbGarments = [];

    // Query garments table from Supabase
    if (client) {
        try {
            let query = client.from('garments').select('*');
            // If shop is specified, filter garments by store_id or shop_id
            if (shopId) {
                query = query.or(`shop_id.eq.${shopId},store_id.eq.${shopId}`);
            }
            const { data, error } = await query;
            if (!error && Array.isArray(data) && data.length > 0) {
                dbGarments = data;
            } else if (error) {
                console.warn('Supabase garments query notice:', error);
            }
        } catch (err) {
            console.warn('Supabase garments fetch exception:', err);
        }
    }

    // Exclude any footwear or shoe items from query results
    if (Array.isArray(dbGarments)) {
        dbGarments = dbGarments.filter(g => !isFootwearItem(g));
    }

    // If Supabase returned no rows, automatically sync the apparel storage bucket garments into the table
    if (!dbGarments || dbGarments.length === 0) {
        dbGarments = await syncStorageGarmentsToDatabase(client, currentShop.id);
    }

    // Map database rows into structured storefront models (Strictly Apparel: Shirts, Pants, Outerwear)
    storeGarments = dbGarments
        .filter(g => !isFootwearItem(g))
        .map((g, idx) => {
            const rawImg = g.image_url || g.image || g.img_url || g.photo;
            const resolvedImg = resolveGarmentImageUrl(rawImg, g.category);
            const resolvedPrice = parseFloat(g.price) || 49.99;
            const resolvedId = String(g.id || `grm-${idx + 6}`);

            return {
                id: resolvedId,
                dbId: g.id,
                storeId: g.store_id || g.shop_id || currentShop.id,
                title: g.title || g.name || 'Signature Apparel',
                category: g.category || 'Apparel',
                price: resolvedPrice,
                originalPrice: g.original_price ? parseFloat(g.original_price) : (resolvedPrice * 1.25),
                discount: g.discount || (idx % 2 === 0 ? '-20%' : null),
                rating: g.rating ? parseFloat(g.rating) : 4.9,
                reviews: g.reviews ? parseInt(g.reviews, 10) : (42 + (idx * 11)),
                colors: g.colors && Array.isArray(g.colors) ? g.colors : ['#111111', '#c49a6c', '#4b5563'],
                image: resolvedImg,
                anywearModelId: g.anywear_model_id || g.anywearModelId || resolvedId,
                arUrl: g.ar_url || `https://anywear.decart.ai/virtual-try-on?model=${encodeURIComponent(g.anywear_model_id || resolvedId)}`
            };
        });

    // If specific garmentId is in URL, bring that item to the very top
    if (garmentId) {
        const targetIndex = storeGarments.findIndex(g => 
            String(g.id) === String(garmentId) || 
            (g.title && g.title.toLowerCase().includes(garmentId.toLowerCase()))
        );
        if (targetIndex > -1) {
            const [targetItem] = storeGarments.splice(targetIndex, 1);
            storeGarments.unshift(targetItem);
        }
    }

    allStoreGarments = [...storeGarments];
    renderStoreProducts();

    // If a garment_id parameter was provided, scroll to it and highlight
    if (garmentId) {
        highlightTargetGarment(garmentId);
    }
}

// --- Render Product Cards Dynamically ---
function renderStoreProducts() {
    const container = document.getElementById('store-products-grid');
    if (!container) return;

    if (storeGarments.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: #888;">
                <i class="fa-solid fa-shirt" style="font-size: 32px; color: #ccc; margin-bottom: 12px;"></i>
                <p style="font-size: 14px; font-weight: 700; color: #222;">No Garments Available In This Outlet</p>
                <p style="font-size: 12px; margin-top: 4px;">Items added via the Merchant Dashboard will sync here in real-time.</p>
            </div>
        `;
        return;
    }

    const { garmentId } = getUrlParams();

    container.innerHTML = storeGarments.map(item => {
        const isTarget = (garmentId && (String(item.id) === String(garmentId) || item.title.toLowerCase().includes(garmentId.toLowerCase())));
        const waMessage = encodeURIComponent(`Hi ${currentShop.name}, I am interested in ordering/trying on: ${item.title} ($${item.price.toFixed(2)}).`);
        const waLink = `https://wa.me/${(currentShop.owner_whatsapp || currentShop.phone).replace(/[^0-9]/g, '')}?text=${waMessage}`;
        const modelId = item.anywearModelId || item.id;

        return `
        <div id="product-card-${item.id}" class="product-card ${isTarget ? 'garment-focused' : ''}" data-product-id="${item.id}" data-model-id="${modelId}">
            <div class="product-img-wrap" style="position: relative;">
                ${item.discount ? `<span class="discount-badge">${item.discount}</span>` : ''}

                <button class="wishlist-btn" title="Add to Wishlist" onclick="event.stopPropagation(); this.classList.toggle('active')">
                    <i class="fa-regular fa-heart"></i>
                </button>

                <img src="${item.image}" alt="${item.title}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600'">
            </div>

            <div class="product-info">
                <div style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #c49a6c; margin-bottom: 4px;">
                    ${item.category}
                </div>

                <h3 class="product-title" title="${item.title}">${item.title}</h3>
                
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
}

// ==========================================================================
// Lead Capture Gate & Display Logic
// ==========================================================================

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
    const waLink = `https://wa.me/${(currentShop.owner_whatsapp || currentShop.phone).replace(/[^0-9]/g, '')}?text=${waMessage}`;

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

            <div style="width: 100%; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.08); background: #f8f8f8; position: relative;">
                <img id="spotlight-garment-image" 
                     src="${targetGarment.image}" 
                     alt="${targetGarment.title}" 
                     style="width: 100%; height: auto; max-height: 520px; object-fit: cover; display: block;"
                     onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80&w=600'">
            </div>

            <div style="margin-top: 20px;">
                <a href="${waLink}" target="_blank" class="whatsapp-inquire-btn" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 28px; border-radius: 12px; font-size: 13px; font-weight: 700; text-decoration: none;">
                    <i class="fa-brands fa-whatsapp"></i> Inquire on WhatsApp
                </a>
            </div>
        </div>
    `;

    spotlightSection.style.display = 'block';
    spotlightSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// "View Full Catalog" Toggle Action
function showFullCatalog() {
    const spotlightSection = document.getElementById('garment-spotlight-section');
    const productsSection = document.getElementById('products');
    const heroSection = document.getElementById('hero');

    if (spotlightSection) spotlightSection.style.display = 'none';
    if (heroSection) heroSection.style.display = 'block';
    if (productsSection) {
        productsSection.style.display = 'block';
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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

    // 1. Format phone to strict E.164 standard
    const formattedPhone = formatToE164(rawPhone);

    // 2. Real-Time WhatsApp Verification via Supabase Edge Function ('verify-ekyc')
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.style.opacity = '0.75';
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Verifying WhatsApp...</span>';
    }
    setStatus('<i class="fa-solid fa-spinner fa-spin"></i> Checking WhatsApp account with eKYC Pro...', 'info');

    let ekycResult;
    try {
        ekycResult = await verifyWhatsAppPhoneEkyc(formattedPhone);
    } catch (err) {
        console.warn('eKYC check error caught:', err);
        ekycResult = { verified: false, registered: null, checkId: null, formattedPhone, isFallback: true, error: err.message };
    }

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

    const { garmentId, shopId } = getUrlParams();
    const focusedGarment = storeGarments.find(g => String(g.id) === String(garmentId));
    const garmentName = focusedGarment ? focusedGarment.title : 'General Store VIP Access';
    const activeGarmentId = focusedGarment ? focusedGarment.id : (garmentId || null);
    const activeStoreId = getValidStoreId(focusedGarment ? focusedGarment.storeId : (currentShop.id || shopId));

    // Smoothly clear blur and close lead modal
    const modal = document.getElementById('lead-modal');
    const mainContent = document.getElementById('main-store-content');

    setTimeout(() => {
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
    }, 400);

    // Post-Submission Display Logic (Spotlight scanned garment or full catalog)
    if (garmentId) {
        renderSpotlightView(garmentId);
    } else {
        showFullCatalog();
    }

    // Activity Telemetry Log
    const now = new Date();
    const dateFormatted = now.toISOString().slice(0, 10) + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const storedLogs = JSON.parse(localStorage.getItem('labis_logs')) || [];
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

    postLeadToSupabase(newLead).catch(err => console.warn('Supabase post lead notice:', err));
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
    const config = (typeof window !== 'undefined' && window.localStorage && JSON.parse(localStorage.getItem('labis_api_config') || '{}')) || {};
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
                return;
            } else if (error && (error.message.includes('column') || error.code === '42703')) {
                // If columns whatsapp_verified or ekyc_check_id do not exist in table schema, fallback to base columns
                console.log('Falling back to standard 3-column lead schema:', error.message);
                const { data: baseData, error: baseErr } = await client.from('leads').insert([basePayload]);
                if (!baseErr) return;
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
        if (!res.ok) {
            // Fallback to base columns on REST if schema error
            await fetch(`${supabaseUrl}/rest/v1/leads`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(basePayload)
            });
        }
    } catch (err) {
        console.warn('Supabase REST insert notice:', err);
    }
}

// Webhook Dispatcher
function postLeadToWebhook(leadData) {
    const config = JSON.parse(localStorage.getItem('labis_api_config')) || {};
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
    }
}

function closeTryOnModal() {
    if (window.Anywear && typeof window.Anywear.close === 'function') {
        window.Anywear.close();
    }
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
}

// Category Filter Helper (Apparel Only)
function filterCategory(cat) {
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

// Onload Boot — Universal Lead Gate (All Traffic Sources) & Session Persistence
window.onload = async function() {
    await initShopBranding();
    await fetchAndRenderGarments();

    const { shopId, garmentId } = getUrlParams();
    
    // 1. Check browser storage for universal lead capture persistence
    const isCaptured = localStorage.getItem('gobstore_lead_captured') === 'true' || sessionStorage.getItem('gobstore_lead_captured') === 'true';

    if (!isCaptured) {
        // Requirement 1: If NOT set, lock/blur product interaction and trigger the VIP Lead-Capture form immediately upon landing
        openLeadModal(garmentId);
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
        if (garmentId) {
            renderSpotlightView(garmentId);
        } else {
            showFullCatalog();
        }
    }
};
