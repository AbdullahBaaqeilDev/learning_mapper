const RoadmapController = {
    network: null,
    nodesDataset: new vis.DataSet(),
    edgesDataset: new vis.DataSet(),
    currentRoadmapTitle: "",
    selectedNodeId: null,

    targetPositions: {},
    animationFrameId: null,

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
        this.lastDragPositions = {};

        // Disable continuous physics force loop
        this.network.setOptions({
            physics: { enabled: false },
            interaction: { dragNodes: true }
        });

        this.network.on("dragStart", (params) => {
            if (params.nodes.length > 0) {
                const positions = this.network.getPositions(params.nodes);
                
                params.nodes.forEach(nodeId => {
                    if (positions[nodeId]) {
                        // Store initial position to track frame-by-frame delta
                        this.lastDragPositions[nodeId] = { ...positions[nodeId] };
                    }

                    // Unlock node fixed status so cursor moves it fluently
                    this.nodesDataset.update({
                        id: nodeId,
                        fixed: { x: false, y: false }
                    });
                });
            }
        });

        // SMOOTH REAL-TIME DRAGGING: Shift children continuously as the mouse moves
        this.network.on("dragging", (params) => {
            if (params.nodes.length > 0) {
                const currentPositions = this.network.getPositions(params.nodes);

                params.nodes.forEach(nodeId => {
                    const lastPos = this.lastDragPositions[nodeId];
                    const currentPos = currentPositions[nodeId];

                    if (lastPos && currentPos) {
                        const deltaX = currentPos.x - lastPos.x;
                        const deltaY = currentPos.y - lastPos.y;

                        if (deltaX !== 0 || deltaY !== 0) {
                            // Queue target offset updates for child subtree
                            const visited = new Set([nodeId]);
                            this.updateChildrenTargetsRecursively(nodeId, deltaX, deltaY, visited);

                            // Kick off smooth movement loop
                            this.startSmoothFollowLoop();

                            this.lastDragPositions[nodeId] = { ...currentPos };
                        }
                    }
                });
            }
        });

        this.network.on("dragEnd", (params) => {
            if (params.nodes.length > 0) {
                const endPositions = this.network.getPositions(params.nodes);

                params.nodes.forEach(nodeId => {
                    const endPos = endPositions[nodeId];
                    if (endPos) {
                        // Lock parent position on drop
                        this.nodesDataset.update({
                            id: nodeId,
                            x: endPos.x,
                            y: endPos.y,
                            fixed: { x: true, y: true }
                        });
                    }
                });

                this.lastDragPositions = {};

                // Save roadmap history & storage
                if (window.roadmapHistory) {
                    window.roadmapHistory.recordDrag(this.getCurrentState());
                }
                if (typeof StorageManager !== 'undefined') {
                    StorageManager.saveRoadmap(this.getCurrentState());
                }
            }
        });

        this.network.on("selectNode", (params) => {
            if (params.nodes.length === 1) {
                this.openNodeModal(params.nodes[0]);
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

    // Ticker function to smoothly move child nodes towards their targets at constant speed
    startSmoothFollowLoop: function() {
        if (this.animationFrameId) return; // Loop already running

        const moveLoop = () => {
            const updates = [];
            const speed = 12; // Speed limit in pixels per frame (adjust to make faster/slower)
            let remainingTargets = false;

            Object.keys(this.targetPositions).forEach(nodeId => {
                const target = this.targetPositions[nodeId];
                const node = this.nodesDataset.get(nodeId);

                if (node && target) {
                    const currentX = node.x || 0;
                    const currentY = node.y || 0;

                    const dx = target.x - currentX;
                    const dy = target.y - currentY;
                    const distance = Math.hypot(dx, dy);

                    // If not yet at target position
                    if (distance > 0.5) {
                        remainingTargets = true;

                        // Calculate step based on fixed constant speed
                        const step = Math.min(distance, speed);
                        const angle = Math.atan2(dy, dx);

                        const newX = currentX + Math.cos(angle) * step;
                        const newY = currentY + Math.sin(angle) * step;

                        updates.push({
                            id: nodeId,
                            x: newX,
                            y: newY,
                            fixed: { x: true, y: true }
                        });
                    } else {
                        // Reached target destination exactly
                        delete this.targetPositions[nodeId];
                    }
                }
            });

            if (updates.length > 0) {
                this.nodesDataset.update(updates);
            }

            if (remainingTargets) {
                this.animationFrameId = requestAnimationFrame(moveLoop);
            } else {
                this.animationFrameId = null; // Stop animation loop when settled
            }
        };

        this.animationFrameId = requestAnimationFrame(moveLoop);
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
        if (node) {
            // 1. Update target node to completed (Green)
            node.status = 'completed';
            const style = this.styleMap.completed;
            node.color = { background: style.background, border: style.border };
            node.font = { color: style.text };
            
            this.nodesDataset.update(node);
            this.closeNodeModal();

            // 2. Unlock downstream nodes and update them to current (Purple)
            this.propagateCompletionState(this.selectedNodeId);
            
            // 3. Re-evaluate overall roadmap state and UI eligibility
            this.commitState(true);
            this.checkGoalExpansionEligibility();
        }
    },

    propagateCompletionState: function(completedNodeId) {
        // Find outgoing edges where completedNodeId is the prerequisite (source/from)
        const outgoingEdges = this.edgesDataset.get({
            filter: edge => edge.from === completedNodeId
        });

        const updatedNodes = [];

        outgoingEdges.forEach(edge => {
            const targetNodeId = edge.to;
            const targetNode = this.nodesDataset.get(targetNodeId);

            // Only transition downstream nodes if they are currently 'locked'
            if (targetNode && targetNode.status === 'locked') {
                // Check if all prerequisites leading into targetNode are completed
                const incomingEdges = this.edgesDataset.get({
                    filter: e => e.to === targetNodeId
                });

                const allPrereqsMet = incomingEdges.every(e => {
                    const prereqNode = this.nodesDataset.get(e.from);
                    return prereqNode && (prereqNode.status === 'completed' || prereqNode.status === 'finished');
                });

                // If all incoming prerequisites are done, unlock to 'current' (Purple)
                if (allPrereqsMet) {
                    const style = this.styleMap.current;
                    targetNode.status = 'current';
                    targetNode.color = { background: style.background, border: style.border };
                    targetNode.font = { color: style.text };
                    updatedNodes.push(targetNode);
                }
            }
        });

        if (updatedNodes.length > 0) {
            this.nodesDataset.update(updatedNodes);
        }
    },

    moveChildrenRecursively: function(parentId, deltaX, deltaY, visited) {
        // Find outgoing edges where parentId is the source
        const childEdges = this.edgesDataset.get({
            filter: edge => edge.from === parentId
        });

        const updates = [];

        childEdges.forEach(edge => {
            const childId = edge.to;

            // Prevent infinite loops in cyclic dependencies
            if (!visited.has(childId)) {
                visited.add(childId);

                // Fetch directly from nodesDataset to get the true stored X and Y
                const childNode = this.nodesDataset.get(childId);
                
                if (childNode) {
                    // Fallback to network positions if x/y are not on the dataset object yet
                    const currentPos = this.network.getPositions([childId])[childId] || { x: childNode.x || 0, y: childNode.y || 0 };

                    const newX = currentPos.x + deltaX;
                    const newY = currentPos.y + deltaY;

                    updates.push({
                        id: childId,
                        x: newX,
                        y: newY,
                        // Lock coordinates so physics/solver never overrides the drag shift
                        fixed: { x: true, y: true }
                    });

                    // Recurse deeper down the child tree
                    this.moveChildrenRecursively(childId, deltaX, deltaY, visited);
                }
            }
        });

        if (updates.length > 0) {
            this.nodesDataset.update(updates);
        }
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

        // 1. Get current position of parent node in canvas space
        const positions = this.network.getPositions([this.selectedNodeId]);
        const parentPos = positions[this.selectedNodeId] || { x: node.x || 0, y: node.y || 0 };

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

            const newNodesCount = result.nodes.length;
            
            // 2. Geometry: Position new nodes in a vertical arc to the RIGHT (+X)
            const horizontalDistance = 320; // Move safely clear to the right
            const verticalSpacing = 120;    // Clean gap between nodes

            const formattedNewNodes = result.nodes.map((n, index) => {
                const style = this.styleMap[n.status] || this.styleMap.current;

                // Evenly center vertically relative to parent Y
                const yOffset = (index - (newNodesCount - 1) / 2) * verticalSpacing;
                
                // Add a subtle arc curve (middle nodes push slightly further right)
                const arcFactor = Math.sin((index / (newNodesCount - 1 || 1)) * Math.PI) * 50;

                return {
                    id: n.id,
                    label: n.label,
                    status: n.status,
                    x: parentPos.x + horizontalDistance + arcFactor,
                    y: parentPos.y + yOffset,
                    color: { background: style.background, border: style.border },
                    font: { color: style.text }
                };
            });

            // 3. Add to dataset
            this.nodesDataset.add(formattedNewNodes);
            this.edgesDataset.add(result.edges);
            this.commitState(true);
            // AUTO-RUN: Automatically reorganize graph layout on spawn
            this.reorganizeLayout();

            // 4. Trigger a brief physics simulation pass to push overlapping nodes apart
            this.network.setOptions({
                physics: {
                    enabled: true,
                    solver: 'forceAtlas2Based',
                    forceAtlas2Based: {
                        gravitationalConstant: -50,
                        centralGravity: 0.005,
                        springLength: 200,
                        springConstant: 0.08,
                        avoidOverlap: 1.0 // Strictly prevent bounding-box overlaps
                    },
                    stabilization: {
                        enabled: true,
                        iterations: 150,
                        updateInterval: 25
                    }
                }
            });

            // 5. Smooth camera pan to show newly expanded subtree
            setTimeout(() => {
                const allBranchNodeIds = [this.selectedNodeId, ...result.nodes.map(n => n.id)];
                this.network.fit({
                    nodes: allBranchNodeIds,
                    animation: { duration: 600, easingFunction: 'easeInOutQuad' }
                });
            }, 150);

        } catch (error) {
            console.error("Exploration failed:", error);
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
    },

    // 1. Call this method whenever nodes or edges update to toggle button state
    checkGoalExpansionEligibility: function() {
        const btn = document.getElementById('btn-create-new-goal');
        if (!btn) return;

        const allNodes = this.nodesDataset.get();
        const allEdges = this.edgesDataset.get();

        if (allNodes.length === 0) {
            btn.disabled = true;
            return;
        }

        // Check Condition 1: Every node is completed/finished
        const allCompleted = allNodes.every(node => 
            node.status === 'completed' || node.status === 'finished'
        );

        // Check Condition 2: Every node has at least 1 edge connection (if 2+ nodes exist)
        let noOrphans = true;
        if (allNodes.length > 1) {
            const connectedNodeIds = new Set();
            allEdges.forEach(edge => {
                connectedNodeIds.add(edge.from);
                connectedNodeIds.add(edge.to);
            });
            noOrphans = allNodes.every(node => connectedNodeIds.has(node.id));
        }

        // Enable button when conditions pass
        btn.disabled = !(allCompleted && noOrphans);
    },

    openGoalExpansionModal: function() {
        document.getElementById('goal-expansion-modal').style.display = 'block';
    },

    closeGoalExpansionModal: function() {
        document.getElementById('goal-expansion-modal').style.display = 'none';
        document.getElementById('new-goal-input').value = '';
    },

    submitGoalExpansion: async function() {
        const goalInput = document.getElementById('new-goal-input').value.trim();
        if (!goalInput) return alert("Please enter your new goal!");

        this.closeGoalExpansionModal();
        this.showLoading("Designing expansion path for your new goal...");

        try {
            const allNodes = this.nodesDataset.get();
            const result = await ApiClient.expandGoal({
                roadmap_title: this.currentRoadmapTitle,
                new_goal: goalInput,
                nodes: allNodes
            });

            // Find previous goal or rightmost terminal node to anchor placement
            const positions = this.network.getPositions();
            let maxCoordinates = { x: 0, y: 0 };
            let anchorNodeId = allNodes[0].id;

            allNodes.forEach(node => {
                const pos = positions[node.id] || { x: 0, y: 0 };
                if (pos.x >= maxCoordinates.x) {
                    maxCoordinates = pos;
                    anchorNodeId = node.id;
                }
            });

            // Temporarily disable hierarchical lock for clean placement
            this.network.setOptions({ layout: { hierarchical: { enabled: false } } });

            // Add new nodes with relative horizontal offset
            let offsetX = maxCoordinates.x + 260;
            let offsetY = maxCoordinates.y;

            const formattedNewNodes = result.new_nodes.map((node, index) => {
                const style = this.styleMap[node.status] || this.styleMap.locked;
                return {
                    id: node.id,
                    label: node.label,
                    status: node.status || 'locked',
                    x: offsetX + (index * 220),
                    y: offsetY + (index % 2 === 0 ? 0 : 60),
                    color: { background: style.background, border: style.border },
                    font: { color: style.text }
                };
            });

            // Add connecting edge from anchor node to AI-selected entry node
            const connectingEdge = {
                from: anchorNodeId,
                to: result.entry_node_id
            };

            const formattedNewEdges = result.new_edges.map(edge => ({
                from: edge.from || edge.from_node,
                to: edge.to || edge.to_node
            }));

            // Push additions to Vis.js Datasets
            this.nodesDataset.add(formattedNewNodes);
            this.edgesDataset.add([connectingEdge, ...formattedNewEdges]);

            // Save state & update eligibility
            this.commitState(true);
            this.checkGoalExpansionEligibility();
            
            setTimeout(() => this.network.fit({ animation: true }), 300);

        } catch (error) {
            console.error("Goal Expansion Error:", error);
            alert(`Failed to expand roadmap: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    },
    

    updateChildrenTargetsRecursively: function(parentId, deltaX, deltaY, visited) {
        const childEdges = this.edgesDataset.get({
            filter: edge => edge.from === parentId
        });

        childEdges.forEach(edge => {
            const childId = edge.to;

            if (!visited.has(childId)) {
                visited.add(childId);

                // Determine base reference position
                const currentTarget = this.targetPositions[childId];
                const node = this.nodesDataset.get(childId);

                const basePos = currentTarget || {
                    x: node ? node.x || 0 : 0,
                    y: node ? node.y || 0 : 0
                };

                // Set new target location
                this.targetPositions[childId] = {
                    x: basePos.x + deltaX,
                    y: basePos.y + deltaY
                };

                // Recurse down subtree
                this.updateChildrenTargetsRecursively(childId, deltaX, deltaY, visited);
            }
        });
    },

    reorganizeLayout: function() {
        if (!this.network || this.nodesDataset.length === 0) return;

        // Unfix nodes so the solver can redistribute the tree freely
        const unFixedNodes = this.nodesDataset.get().map(node => ({
            id: node.id,
            fixed: { x: false, y: false }
        }));
        this.nodesDataset.update(unFixedNodes);

        // Run force simulation
        this.network.setOptions({
            physics: {
                enabled: true,
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -50,
                    centralGravity: 0.01,
                    springLength: 160,
                    springConstant: 0.08,
                    avoidOverlap: 1.0
                },
                stabilization: {
                    enabled: true,
                    iterations: 200,
                    updateInterval: 25
                }
            }
        });

        this.network.stabilize();

        this.network.once('stabilizationIterationsDone', () => {
            // Turn off continuous continuous movement so manual dragging stays responsive
            this.network.setOptions({ physics: { enabled: false } });
            
            this.network.fit({
                animation: { duration: 500, easingFunction: 'easeInOutQuad' }
            });
        });
    },
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