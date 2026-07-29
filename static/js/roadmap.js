const RoadmapController = {
    network: null,
    nodesDataset: new vis.DataSet(),
    edgesDataset: new vis.DataSet(),
    currentRoadmapTitle: "",
    selectedNodeId: null,

    styleMap: {
        completed: { background: "#10b981", border: "#059669", text: "#ffffff" }, // Green
        current:   { background: "#8b5cf6", border: "#7c3aed", text: "#ffffff" }, // Purple
        locked:    { background: "#334155", border: "#1e293b", text: "#94a3b8" }  // Gray
    },

    getCurrentState: function() {
        return {
            roadmap_title: this.currentRoadmapTitle,
            nodes: this.nodesDataset.get(),
            edges: this.edgesDataset.get()
        };
    },

    commitState: function(saveToStorage = true) {
        const state = this.getCurrentState();
        if (window.roadmapHistory) {
            window.roadmapHistory.push(state);
        }
        if (saveToStorage && typeof StorageManager !== 'undefined') {
            StorageManager.saveRoadmap(state);
        }
    },

    getCompletedNodeLabels: function() {
        return this.nodesDataset.get({
            filter: item => item.status === 'completed'
        }).map(n => n.label);
    },

    init: function() {
        const container = document.getElementById('network-canvas');
        if (!container) return;

        const data = { nodes: this.nodesDataset, edges: this.edgesDataset };
        const options = {
            nodes: {
                shape: 'box',
                margin: 14,
                font: {
                    bold: {
                        color: '#ffffff',
                        size: 14,
                        face: 'sans-serif',
                        mod: 'bold'
                    }
                },
                borderWidth: 2,
                shadow: { enabled: true, color: 'rgba(0,0,0,0.5)', size: 10 }
            },
            edges: {
                width: 2,
                color: { color: '#475569', highlight: '#818cf8' },
                arrows: { to: { enabled: true, scaleFactor: 0.8 } },
                smooth: { type: 'cubicBezier', forceDirection: 'horizontal' }
            },
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'LR',
                    sortMethod: 'directed',
                    levelSeparation: 240,
                    nodeSpacing: 120,
                    blockShifting: false, // Prevents snap-locking along axes
                    edgeMinimization: false
                }
            },
            physics: { enabled: false },
            interaction: { hover: true, zoomView: true, dragView: true }
        };

        this.network = new vis.Network(container, data, options);
        const net = this.network;
        setTimeout(() => {
            if (net) {
                net.setSize('100%', '100%');
                net.redraw();
            }
        }, 50);
        this.bindEvents();
        this.loadState();
    },

    calculateSmartPosition: function(sourceNodeId, targetNodeId) {
        const positions = this.network.getPositions();
        const sourcePos = positions[sourceNodeId] || { x: 0, y: 0 };
        let targetPos = targetNodeId ? positions[targetNodeId] : null;

        let posX = sourcePos.x + 220; // Default spacing to the right
        let posY = sourcePos.y;

        if (targetPos) {
            // Place midpoint between source and target orphan node
            posX = (sourcePos.x + targetPos.x) / 2;
            posY = (sourcePos.y + targetPos.y) / 2;
        }

        // Collision avoidance check against existing nodes
        const allNodes = this.nodesDataset.get();
        let collision = true;
        let attempts = 0;

        while (collision && attempts < 10) {
            collision = allNodes.some(node => {
                const p = positions[node.id];
                if (!p) return false;
                const distance = Math.sqrt(Math.pow(p.x - posX, 2) + Math.pow(p.y - posY, 2));
                return distance < 130; // Minimum allowed pixel gap between node centers
            });

            if (collision) {
                // Shift vertically on collision
                posY += (attempts % 2 === 0 ? 120 : -240);
                attempts++;
            }
        }

        return { x: posX, y: posY };
    },

    bindEvents: function() {
        // Track node position before drag starts
        this.dragStartPositions = {};

        this.network.on("dragStart", (params) => {
            if (params.nodes.length > 0) {
                const positions = this.network.getPositions(params.nodes);
                params.nodes.forEach(nodeId => {
                    if (positions[nodeId]) {
                        this.dragStartPositions[nodeId] = { ...positions[nodeId] };
                    }
                });
            }
        });

        this.network.on("selectNode", (params) => {
            if (params.nodes.length === 1) {
                this.openNodeModal(params.nodes[0]);
            }
        });

        this.network.on("dragEnd", (params) => {
            if (params.nodes.length > 0) {
                // Un-fix layout hierarchy to allow free movement in all directions
                this.network.setOptions({ layout: { hierarchical: { enabled: false } } });

                const endPositions = this.network.getPositions(params.nodes);

                params.nodes.forEach(nodeId => {
                    const node = this.nodesDataset.get(nodeId);
                    const startPos = this.dragStartPositions[nodeId];
                    const endPos = endPositions[nodeId];

                    if (node && startPos && endPos) {
                        // Calculate offset distance (delta)
                        const deltaX = endPos.x - startPos.x;
                        const deltaY = endPos.y - startPos.y;

                        // Update dragged parent node
                        node.x = endPos.x;
                        node.y = endPos.y;
                        this.nodesDataset.update(node);

                        // Move all child nodes by the same delta if moved
                        if (deltaX !== 0 || deltaY !== 0) {
                            const visited = new Set([nodeId]); // Mark root dragged node as visited
                            this.moveChildrenRecursively(nodeId, deltaX, deltaY, visited);
                        }
                    }
                });

                // Clear tracked drag start positions
                this.dragStartPositions = {};

                if (window.roadmapHistory) {
                    window.roadmapHistory.recordDrag(this.getCurrentState());
                }
                if (typeof StorageManager !== 'undefined') {
                    StorageManager.saveRoadmap(this.getCurrentState());
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.executeRedo();
                } else {
                    this.executeUndo();
                }
            }
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                this.executeRedo();
            }
        });
    },

    executeUndo: function() {
        if (!window.roadmapHistory) return;
        const success = window.roadmapHistory.undo((previousState) => {
            this.renderSilent(previousState);
        });
        if (success) {
            this.closeNodeModal();
        }
    },

    executeRedo: function() {
        if (!window.roadmapHistory) return;
        const success = window.roadmapHistory.redo((nextState) => {
            this.renderSilent(nextState);
        });
        if (success) {
            this.closeNodeModal();
        }
    },

    renderSilent: function(data) {
        this.currentRoadmapTitle = data.roadmap_title || "Learning Path";
        const headerTitle = document.getElementById('roadmap-header-title');
        if (headerTitle) {
            headerTitle.innerText = this.currentRoadmapTitle;
            headerTitle.classList.remove('hidden');
        }

        this.nodesDataset.clear();
        this.edgesDataset.clear();
        this.nodesDataset.add(data.nodes);
        this.edgesDataset.add(data.edges);

        if (typeof StorageManager !== 'undefined') {
            StorageManager.saveRoadmap(data);
        }
    },

    loadState: function() {
        const savedData = StorageManager.getRoadmap();
        if (savedData) {
            this.render(savedData);
            document.getElementById('onboarding-panel').classList.add('hidden');
        }
    },

    render: function(data) {
        this.currentRoadmapTitle = data.roadmap_title || "Learning Path";
        const headerTitle = document.getElementById('roadmap-header-title');
        if (headerTitle) {
            headerTitle.innerText = this.currentRoadmapTitle;
            headerTitle.classList.remove('hidden');
        }

        const formattedNodes = data.nodes.map(node => {
            const style = this.styleMap[node.status] || this.styleMap.locked;
            return {
                id: node.id,
                label: node.label,
                status: node.status,
                x: node.x || undefined,
                y: node.y || undefined,
                color: { background: style.background, border: style.border },
                font: { color: style.text }
            };
        });

        this.nodesDataset.clear();
        this.edgesDataset.clear();
        this.nodesDataset.add(formattedNodes);
        this.edgesDataset.add(data.edges);

        this.commitState(true);
        setTimeout(() => this.network.fit({ animation: true }), 300);
    },

    openNodeModal: function(nodeId) {
        this.selectedNodeId = nodeId;
        const node = this.nodesDataset.get(nodeId);
        if (!node) return;

        document.getElementById('modal-node-title').innerText = node.label;
        const statusBadge = document.getElementById('modal-node-status');
        statusBadge.innerText = node.status.toUpperCase();
        statusBadge.className = `text-[10px] font-bold px-2 py-0.5 rounded-full ${
            node.status === 'completed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
            node.status === 'current' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' :
            'bg-slate-800 text-slate-400 border border-slate-700'
        }`;

        const btnNextStep = document.getElementById('btn-action-next-step');
        if (node.status === 'completed') {
            btnNextStep.disabled = false;
            btnNextStep.className = "w-full bg-slate-800 hover:bg-slate-700 text-white font-medium p-3 rounded-xl transition flex items-center justify-between group border border-slate-700";
        } else {
            btnNextStep.disabled = true;
            btnNextStep.className = "w-full bg-slate-900/50 text-slate-600 font-medium p-3 rounded-xl cursor-not-allowed flex items-center justify-between border border-slate-800/50";
        }

        document.getElementById('node-interaction-modal').classList.remove('hidden');
        document.getElementById('node-interaction-modal').classList.add('flex');
    },

    closeNodeModal: function() {
        document.getElementById('node-interaction-modal').classList.add('hidden');
        document.getElementById('node-interaction-modal').classList.remove('flex');
        this.network.unselectAll();
    },

    markSelectedAsFinished: function() {
        if (!this.selectedNodeId) return;
        const node = this.nodesDataset.get(this.selectedNodeId);
        if (!node) return;

        // 1. Mark target node as completed (Green)
        node.status = 'completed';
        const style = this.styleMap.completed;
        node.color = { background: style.background, border: style.border };
        node.font = { color: style.text };
        this.nodesDataset.update(node);

        // 2. Propagate state change to adjacent locked neighbors
        this.propagateCompletionState(node.id);

        // 3. Persist state and refresh modal
        this.commitState(true);
        this.openNodeModal(this.selectedNodeId);
    },

    propagateCompletionState: function(completedNodeId) {
        const connectedEdgeIds = this.network.getConnectedEdges(completedNodeId);
        const updatedNodes = [];

        connectedEdgeIds.forEach(edgeId => {
            const edge = this.edgesDataset.get(edgeId);
            if (!edge) return;

            // Determine neighboring node ID
            const neighborId = (edge.from === completedNodeId) ? edge.to : edge.from;
            const neighborNode = this.nodesDataset.get(neighborId);

            // Rule: Only unlock neighboring nodes if they are currently 'locked' (Gray)
            if (neighborNode && neighborNode.status === 'locked') {
                const style = this.styleMap.current; // Transition to Purple
                neighborNode.status = 'current';
                neighborNode.color = { background: style.background, border: style.border };
                neighborNode.font = { color: style.text };
                updatedNodes.push(neighborNode);
            }
        });

        if (updatedNodes.length > 0) {
            this.nodesDataset.update(updatedNodes);
        }
    },

    moveChildrenRecursively: function(parentNodeId, deltaX, deltaY, visited = new Set()) {
        // Prevent infinite loops in cyclical graphs
        if (visited.has(parentNodeId)) return;
        visited.add(parentNodeId);

        // Get all connected edges
        const connectedEdges = this.edgesDataset.get({
            filter: edge => edge.from === parentNodeId
        });

        connectedEdges.forEach(edge => {
            const childNodeId = edge.to;
            
            // Skip if child was already processed in this drag operation
            if (visited.has(childNodeId)) return;

            const childNode = this.nodesDataset.get(childNodeId);
            const currentPos = this.network.getPositions([childNodeId])[childNodeId];

            if (childNode && currentPos) {
                // Calculate and update child's new absolute position using the same offset
                const newX = currentPos.x + deltaX;
                const newY = currentPos.y + deltaY;

                // Update node in dataset and vis network view
                childNode.x = newX;
                childNode.y = newY;
                this.nodesDataset.update(childNode);
                this.network.moveNode(childNodeId, newX, newY);

                // Recursively move downstream children of this child
                this.moveChildrenRecursively(childNodeId, deltaX, deltaY, visited);
            }
        });
    },
    
    generateNextStep: async function() {
        this.closeNodeModal();
        this.showLoading("Analyzing graph trajectory & evaluating destination goals...");

        try {
            // 1. Send entire node and edge datasets to backend AI planner
            const plannerPayload = {
                roadmap_title: this.currentRoadmapTitle,
                nodes: this.nodesDataset.get(),
                edges: this.edgesDataset.get()
            };

            const result = await ApiClient.expandNode(plannerPayload);

            // 2. Format and add new edges returned by planner
            const formattedEdges = (result.new_edges || []).map(edge => ({
                from: edge.from || edge.from_node,
                to: edge.to || edge.to_node
            }));

            // 3. Handle Direct Connection Case (No new node created)
            if (result.direct_connect || !result.new_node) {
                if (formattedEdges.length > 0) {
                    this.edgesDataset.add(formattedEdges);
                    this.commitState(true);
                }
                alert(`Goal Connected directly! ${result.reasoning || ''}`);
                return;
            }

            // 4. Handle Bridge Node Creation Case
            const rawNode = result.new_node;
            const style = this.styleMap[rawNode.status] || this.styleMap.current;

            // Find source and target orphan nodes to calculate non-overlapping position
            const sourceEdge = formattedEdges.find(e => e.to === rawNode.id);
            const targetEdge = formattedEdges.find(e => e.from === rawNode.id);

            const smartPos = this.calculateSmartPosition(
                sourceEdge ? sourceEdge.from : this.selectedNodeId,
                targetEdge ? targetEdge.to : null
            );

            const newNodeObject = {
                id: rawNode.id,
                label: rawNode.label,
                status: rawNode.status || 'current',
                x: smartPos.x,
                y: smartPos.y,
                color: { background: style.background, border: style.border },
                font: { color: style.text }
            };

            // Un-fix hierarchical layout temporarily to allow custom calculated coordinates
            this.network.setOptions({ layout: { hierarchical: { enabled: false } } });

            // Add node and edges to canvas
            this.nodesDataset.add(newNodeObject);
            if (formattedEdges.length > 0) {
                this.edgesDataset.add(formattedEdges);
            }

            // Save state & redraw network smoothly
            this.commitState(true);
            setTimeout(() => this.network.fit({ animation: true }), 300);

        } catch (error) {
            console.error("Next Step Generation Error:", error);
            alert(`Planning failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    },

    exploreMore: async function() {
        if (!this.selectedNodeId) return;
        const node = this.nodesDataset.get(this.selectedNodeId);
        if (!node) return;

        this.closeNodeModal();
        this.showLoading(`Mapping deep-dive concepts for "${node.label}"...`);

        try {
            const result = await ApiClient.exploreNode({
                node_id: node.id,
                label: node.label,
                roadmap_title: this.currentRoadmapTitle,
                existing_ids: this.nodesDataset.getIds(),
                existing_labels: this.nodesDataset.get().map(n => n.label),
                completed_history: this.getCompletedNodeLabels()
            });

            const formattedNewNodes = result.nodes.map(n => {
                const style = this.styleMap[n.status] || this.styleMap.current;
                return {
                    id: n.id,
                    label: n.label,
                    status: n.status,
                    color: { background: style.background, border: style.border },
                    font: { color: style.text }
                };
            });

            this.nodesDataset.add(formattedNewNodes);
            this.edgesDataset.add(result.edges);
            
            this.commitState(true);
            setTimeout(() => this.network.fit({ animation: true }), 300);
        } catch (error) {
            alert(`Exploration failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    },

    navigateToResources: function() {
        if (!this.selectedNodeId) return;
        const node = this.nodesDataset.get(this.selectedNodeId);
        const url = `/resources?topic=${encodeURIComponent(node.label)}&roadmap=${encodeURIComponent(this.currentRoadmapTitle)}&node_id=${node.id}`;
        window.location.href = url;
    },

    generateInitialMap: async function() {
        const hobby = document.getElementById('input-hobby').value || "Python Game Dev";
        const goal = document.getElementById('input-goal').value || "Build 2D Indie Games";
        const experience = document.getElementById('input-experience').value || "Know variables and loops";

        this.showLoading("AI is mapping your custom learning trajectory...");
        try {
            const data = await ApiClient.generateRoadmap({ hobby, goal, experience });
            document.getElementById('onboarding-panel').classList.add('hidden');
            this.render(data);
        } catch (error) {
            alert(`Generation failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    },

    handleExpandNode: async function(nodeId, nodeLabel) {
        try {
            // 1. Fetch current IDs directly from your Vis.js DataSets
            const existingNodeIds = new Set(nodesDataSet.getIds());
            
            // 2. Request expansion from API
            const response = await ApiClient.expandNode({
                node_id: nodeId,
                label: nodeLabel,
                roadmap_title: currentRoadmapTitle,
                existing_ids: Array.from(existingNodeIds)
            });

            const { nodes: newNodes, edges: newEdges } = response;

            // 3. Deduplicate Nodes
            const seenNodeIds = new Set();
            const nodesToAdd = [];

            newNodes.forEach(node => {
                // Skip if ID already in graph OR if duplicate in this batch
                if (!node.id || existingNodeIds.has(node.id) || seenNodeIds.has(node.id)) {
                    return;
                }
                seenNodeIds.add(node.id);
                nodesToAdd.push(node);
            });

            // 4. Deduplicate Edges
            const existingEdgeIds = new Set(edgesDataSet.getIds());
            const seenEdgeKeys = new Set();
            const edgesToAdd = [];

            newEdges.forEach(edge => {
                const edgeKey = `${edge.from}->${edge.to}`;
                
                // Avoid duplicate edge connections or existing edge IDs
                if (seenEdgeKeys.has(edgeKey)) return;
                if (edge.id && existingEdgeIds.has(edge.id)) return;

                seenEdgeKeys.add(edgeKey);
                edgesToAdd.push(edge);
            });

            // 5. Safely add to Vis.js DataSets
            if (nodesToAdd.length > 0) {
                nodesDataSet.add(nodesToAdd);
            }
            if (edgesToAdd.length > 0) {
                edgesDataSet.add(edgesToAdd);
            }

        } catch (error) {
            console.error("Expansion error:", error);
            alert(`Expansion failed: ${error.message}`);
        }
    },

    loadDemoMode: function() {
        const demoData = {
            roadmap_title: "Demo: Python Game Development",
            nodes: [
                { id: "node_1", label: "Python Variables & Loops", status: "completed" },
                { id: "node_2", label: "Pygame Window Setup", status: "completed" },
                { id: "node_3", label: "Game Loop & FPS Clock", status: "current" },
                { id: "node_4", label: "Drawing Surfaces & Rects", status: "current" },
                { id: "node_5", label: "Keyboard Event Handling", status: "locked" },
                { id: "node_6", label: "Sprite Collision Detection", status: "locked" }
            ],
            edges: [
                { from: "node_1", to: "node_2" },
                { from: "node_2", to: "node_3" },
                { from: "node_2", to: "node_4" },
                { from: "node_3", to: "node_5" },
                { from: "node_4", to: "node_6" }
            ]
        };
        document.getElementById('onboarding-panel').classList.add('hidden');
        this.render(demoData);
    },

    reset: function() {
        if (confirm("Reset current roadmap and begin a new path?")) {
            StorageManager.clearRoadmap();
            this.nodesDataset.clear();
            this.edgesDataset.clear();
            document.getElementById('roadmap-header-title').classList.add('hidden');
            document.getElementById('onboarding-panel').classList.remove('hidden');
        }
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
    // Start the animated background
    new NetworkBackground('network-bg-canvas', {
        dotDensity: 0.00018,
        dotSpeed: 0.35,
        maxConnectDist: 130
    });

    if (document.getElementById('network-canvas')) {
        RoadmapController.init();
    }
});