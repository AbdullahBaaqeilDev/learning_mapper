const StorageManager = {
    ROADMAP_KEY: 'ai_roadmap_data',
    RESOURCES_PREFIX: 'ai_resources_',

    getRoadmap: function() {
        const data = localStorage.getItem(this.ROADMAP_KEY);
        return data ? JSON.parse(data) : null;
    },

    saveRoadmap: function(data) {
        localStorage.setItem(this.ROADMAP_KEY, JSON.stringify(data));
    },

    clearRoadmap: function() {
        localStorage.removeItem(this.ROADMAP_KEY);
    },

    getResources: function(topic) {
        const key = `${this.RESOURCES_PREFIX}${topic.toLowerCase().trim()}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    },

    saveResources: function(topic, data) {
        const key = `${this.RESOURCES_PREFIX}${topic.toLowerCase().trim()}`;
        localStorage.setItem(key, JSON.stringify(data));
    },
    
    saveNodePosition(nodeId, x, y) {
        const positions = JSON.parse(localStorage.getItem('node_positions') || '{}');
        
        // Save both horizontal (x) and vertical (y) coordinates
        positions[nodeId] = { x: parseInt(x, 10), y: parseInt(y, 10) };
        
        localStorage.setItem('node_positions', JSON.stringify(positions));
    }
};