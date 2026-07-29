const ResourcesController = {
    topic: "",
    roadmapTitle: "",
    rawResources: [],
    filteredResources: [],

    init: function() {
        const params = new URLSearchParams(window.location.search);
        this.topic = params.get('topic') || "";
        this.roadmapTitle = params.get('roadmap') || "Learning Path";

        const titleEl = document.getElementById('resource-topic-title');
        const breadcrumbEl = document.getElementById('resource-breadcrumb');
        if (!this.topic) {
            document.getElementById('no-topic-banner').classList.remove('hidden');
            document.getElementById('resource-workspace').classList.add('hidden');
            return;
        }

        titleEl.innerText = this.topic;
        breadcrumbEl.innerText = `${this.roadmapTitle} / ${this.topic}`;

        this.bindFilterEvents();
        this.loadInitialData();
    },

    bindFilterEvents: function() {
        const inputs = ['filter-search', 'filter-price', 'filter-difficulty', 'filter-platform', 'filter-type', 'sort-by'];
        inputs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('input', () => this.applyFilters());
        });
    },

    loadInitialData: function() {
        const cached = StorageManager.getResources(this.topic);
        if (cached && cached.resources) {
            this.rawResources = cached.resources;
            this.populateDropdowns();
            this.applyFilters();
            document.getElementById('preferences-panel').classList.add('hidden');
        } else {
            document.getElementById('preferences-panel').classList.remove('hidden');
        }
    },

    generate: async function() {
        const checkedBoxes = document.querySelectorAll('input[name="pref-type"]:checked');
        const preferences = Array.from(checkedBoxes).map(cb => cb.value);

        this.showLoading(`Curating top-tier learning resources for "${this.topic}"...`);
        try {
            const data = await ApiClient.generateResources({
                topic: this.topic,
                roadmap_title: this.roadmapTitle,
                preferences: preferences
            });
            
            this.rawResources = data.resources;
            StorageManager.saveResources(this.topic, data);
            document.getElementById('preferences-panel').classList.add('hidden');
            this.populateDropdowns();
            this.applyFilters();
        } catch (error) {
            alert(`Failed to fetch resources: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    },

    populateDropdowns: function() {
        const platforms = [...new Set(this.rawResources.map(r => r.platform))].sort();
        const types = [...new Set(this.rawResources.map(r => r.resource_type))].sort();

        const platformSelect = document.getElementById('filter-platform');
        const typeSelect = document.getElementById('filter-type');

        platformSelect.innerHTML = '<option value="ALL">All Platforms</option>' +
            platforms.map(p => `<option value="${p}">${p}</option>`).join('');
            
        typeSelect.innerHTML = '<option value="ALL">All Resource Types</option>' +
            types.map(t => `<option value="${t}">${t}</option>`).join('');
    },

    applyFilters: function() {
        const search = document.getElementById('filter-search').value.toLowerCase().trim();
        const price = document.getElementById('filter-price').value;
        const diff = document.getElementById('filter-difficulty').value;
        const platform = document.getElementById('filter-platform').value;
        const type = document.getElementById('filter-type').value;
        const sortBy = document.getElementById('sort-by').value;

        this.filteredResources = this.rawResources.filter(r => {
            const matchSearch = !search || r.title.toLowerCase().includes(search) || 
                                r.platform.toLowerCase().includes(search) || 
                                r.recommendation_reason.toLowerCase().includes(search);
            const matchPrice = price === 'ALL' || r.price_type.toUpperCase() === price;
            const matchDiff = diff === 'ALL' || r.difficulty.toUpperCase() === diff;
            const matchPlatform = platform === 'ALL' || r.platform === platform;
            const matchType = type === 'ALL' || r.resource_type === type;

            return matchSearch && matchPrice && matchDiff && matchPlatform && matchType;
        });

        if (sortBy === 'rating') {
            this.filteredResources.sort((a, b) => b.rating - a.rating);
        } else if (sortBy === 'newest') {
            this.filteredResources.sort((a, b) => b.publication_year - a.publication_year);
        } else if (sortBy === 'oldest') {
            this.filteredResources.sort((a, b) => a.publication_year - b.publication_year);
        }

        this.renderGrid();
    },

    renderGrid: function() {
        const grid = document.getElementById('resources-grid');
        const countLabel = document.getElementById('results-count');
        countLabel.innerText = `Showing ${this.filteredResources.length} of ${this.rawResources.length} resources`;

        if (this.filteredResources.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-12 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
                    <p class="text-slate-400 font-medium">No learning resources match your selected filters.</p>
                    <button onclick="ResourcesController.resetFilters()" class="mt-3 text-xs text-indigo-400 hover:text-indigo-300 underline">Reset all filters</button>
                </div>`;
            return;
        }

        grid.innerHTML = this.filteredResources.map(r => `
            <div class="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition shadow-lg">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-indigo-950/80 text-indigo-300 border border-indigo-800/60">${r.resource_type}</span>
                        <span class="text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                            r.difficulty === 'Beginner' ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' :
                            r.difficulty === 'Intermediate' ? 'bg-amber-950/60 text-amber-300 border border-amber-800/50' :
                            'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                        }">${r.difficulty}</span>
                    </div>

                    <h3 class="font-bold text-white text-base leading-snug mb-1">${r.title}</h3>
                    <div class="text-xs text-indigo-400 font-medium mb-3">${r.platform} &bull; ${r.publication_year}</div>

                    <p class="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 mb-4">
                        "${r.recommendation_reason}"
                    </p>
                </div>

                <div class="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div class="flex flex-col gap-0.5">
                        <span class="text-slate-400 font-medium flex items-center gap-1.5">
                            <span>⏱️ ${r.duration}</span>
                            ${r.rating > 0 ? `<span class="text-amber-400 font-bold">&starf; ${r.rating}</span>` : ''}
                        </span>
                        <span class="${r.price_type === 'Free' ? 'text-emerald-400 font-bold' : 'text-slate-300'}">${r.price_detail}</span>
                    </div>

                    <a href="${r.url}" target="_blank" rel="noopener noreferrer" 
                       class="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-indigo-600/20 flex items-center gap-1">
                        <span>Open</span>
                        <span class="text-[10px]">&nearr;</span>
                    </a>
                </div>
            </div>
        `).join('');
    },

    resetFilters: function() {
        document.getElementById('filter-search').value = "";
        document.getElementById('filter-price').value = "ALL";
        document.getElementById('filter-difficulty').value = "ALL";
        document.getElementById('filter-platform').value = "ALL";
        document.getElementById('filter-type').value = "ALL";
        document.getElementById('sort-by').value = "relevance";
        this.applyFilters();
    },

    showPreferences: function() {
        document.getElementById('preferences-panel').classList.remove('hidden');
    },

    showLoading: function(text) {
        document.getElementById('loading-text').innerText = text;
        document.getElementById('loading-overlay').classList.remove('hidden');
        document.getElementById('loading-overlay').classList.add('flex');
    },

    hideLoading: function() {
        document.getElementById('loading-overlay').classList.add('hidden');
        document.getElementById('loading-overlay').classList.remove('flex');
    }
};

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('resources-grid')) {
        ResourcesController.init();
    }
});