const ApiClient = {
    post: async function(endpoint, payload) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (result.status !== 'success') {
            throw new Error(result.message || 'API request failed');
        }
        return result.data;
    },

    generateRoadmap: function(payload) {
        return this.post('/api/generate-roadmap', payload);
    },

    expandNode: function(payload) {
        return this.post('/api/expand-node', payload);
    },

    generateResources: function(payload) {
        return this.post('/api/generate-resources', payload);
    },

    exploreNode: async function(payload) {
        const response = await fetch('/api/explore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to generate exploration branch');
        }
        return await response.json();
    }
};