import time
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from services.ai_service import AIService

load_dotenv()

app = Flask(__name__)
ai_service = AIService()

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/resources")
def resources():
    return render_template("resources.html")

@app.route("/api/generate-roadmap", methods=["POST"])
def generate_roadmap():
    data = request.get_json() or {}
    hobby = data.get("hobby", "Software Development")
    goal = data.get("goal", "Build production applications")
    experience = data.get("experience", "Basic fundamentals")

    try:
        roadmap_data = ai_service.generate_roadmap(
            hobby=hobby, 
            goal=goal, 
            experience=experience
        )
        
        # Format payload structure for frontend dataset ingestion
        nodes = roadmap_data.get("nodes", [])
        edges = roadmap_data.get("edges", [])
        
        formatted_edges = [
            {"from": e.get("from_node") or e.get("from"), "to": e.get("to_node") or e.get("to")}
            for e in edges
        ]

        return jsonify({
            "status": "success", 
            "data": {
                "roadmap_title": roadmap_data.get("roadmap_title", f"{hobby} Explorer"),
                "nodes": nodes,
                "edges": formatted_edges
            }
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    
@app.route('/api/expand-node', methods=['POST'])
def expand_node():
    try:
        data = request.get_json() or {}
        roadmap_title = data.get('roadmap_title', 'Learning Path')
        nodes = data.get('nodes', [])
        edges = data.get('edges', [])

        if not nodes:
            return jsonify({'error': 'Graph nodes are required for planning'}), 400

        # Invoke AI Service graph planner
        ai_response = ai_service.generate_next_step(roadmap_title, nodes, edges)
        
        return jsonify({
            'success': True,
            'data': ai_response
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/explore', methods=['POST'])
def explore_node():
    data = request.get_json() or {}
    if 'node_id' not in data or 'label' not in data:
        return jsonify({'error': 'Missing required parameters'}), 400

    target_id = data['node_id']
    target_label = data['label']
    roadmap_title = data.get('roadmap_title', 'Learning Path')
    existing_ids = set(data.get('existing_ids', []))
    existing_labels = set(l.lower() for l in data.get('existing_labels', []))
    completed_history = data.get('completed_history', [])

    try:
        exploration_data = ai_service.generate_exploration_branch(
            target_label=target_label,
            roadmap_title=roadmap_title,
            existing_labels=existing_labels,
            completed_history=completed_history
        )

        formatted_nodes = []
        formatted_edges = []

        for item in exploration_data.get('subtopics', []):
            sub_label = item['label'].strip()
            if sub_label.lower() in existing_labels:
                continue

            new_id = f"explore_{abs(hash(sub_label))}_{int(time.time() * 1000) % 10000}"
            while new_id in existing_ids:
                new_id += "_1"
            existing_ids.add(new_id)
            existing_labels.add(sub_label.lower())

            formatted_nodes.append({
                'id': new_id,
                'label': sub_label,
                'status': 'current' if item.get('is_immediate_prereq', True) else 'locked'
            })

            formatted_edges.append({
                'from': target_id,
                'to': new_id
            })

        return jsonify({
            'nodes': formatted_nodes,
            'edges': formatted_edges
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/generate-resources", methods=["POST"])
def generate_resources():
    data = request.get_json() or {}
    topic = data.get("topic", "")
    roadmap_title = data.get("roadmap_title", "")
    preferences = data.get("preferences", [])

    try:
        result = ai_service.generate_resources(
            topic=topic,
            roadmap_title=roadmap_title,
            preferences=preferences
        )
        return jsonify({"status": "success", "data": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/api/breakdown-step', methods=['POST'])
def breakdown_step():
    data = request.get_json() or {}
    target_node_id = data.get('targetNodeId')
    last_finished_node_id = data.get('lastFinishedNodeId')

    try:
        sub_steps = ai_service.breakdown_step(
            target_node_id=target_node_id,
            last_finished_node_id=last_finished_node_id
        )
        return jsonify({"sub_steps": sub_steps}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)