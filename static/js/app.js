/**
 * Injects AI-generated sub-steps into the Vis.js network.
 * Assumes 'nodes', 'edges', and 'network' are globally accessible Vis.js instances.
 */
function injectSubSteps(lastFinishedNodeId, targetNodeId, generatedSteps) {
    const newNodes = [];
    const newEdges = [];

    // Remove direct edge between Last Finished -> Target if it exists
    const existingEdges = edges.get({
        filter: (edge) => edge.from === lastFinishedNodeId && edge.to === targetNodeId
    });
    if (existingEdges.length > 0) {
        edges.remove(existingEdges.map(e => e.id));
    }

    let previousNodeId = lastFinishedNodeId;

    generatedSteps.forEach((step, index) => {
        const uniqueId = `sub_${Date.now()}_${index}`;
        
        newNodes.push({
            id: uniqueId,
            label: step.label,
            title: step.description,
            status: 'pending',
            isGenerated: true,
            color: {
                background: '#1e293b',
                border: '#3b82f6',
                highlight: { background: '#334155', border: '#60a5fa' }
            },
            font: { color: '#f8fafc', face: 'Inter, sans-serif' },
            shape: 'box',
            margin: 12
        });

        newEdges.push({
            id: `edge_${previousNodeId}_to_${uniqueId}`,
            from: previousNodeId,
            to: uniqueId,
            arrows: 'to',
            color: { color: '#64748b', highlight: '#94a3b8' },
            dashes: true
        });

        previousNodeId = uniqueId;
    });

    newEdges.push({
        id: `edge_${previousNodeId}_to_${targetNodeId}`,
        from: previousNodeId,
        to: targetNodeId,
        arrows: 'to',
        color: { color: '#64748b', highlight: '#94a3b8' },
        dashes: true
    });

    // Batch add to dataset
    nodes.add(newNodes);
    edges.add(newEdges);

    // Gently re-balance nodes visually
    network.setOptions({ physics: { enabled: true } });
    network.once('stabilized', () => {
        network.setOptions({ physics: { enabled: false } });
    });
}

// Example trigger on button click:
document.getElementById('btn-breakdown-step')?.addEventListener('click', async () => {
    const targetNodeId = selectedNodeId; // ID of clicked node
    const lastFinishedNodeId = getLastFinishedNodeId(); // Your helper to get last completed node
    
    // Call backend API, get steps JSON response
    const response = await fetch('/api/breakdown-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetNodeId, lastFinishedNodeId })
    });
    const data = await response.json();
    
    // Inject into canvas!
    injectSubSteps(lastFinishedNodeId, targetNodeId, data.sub_steps);
});