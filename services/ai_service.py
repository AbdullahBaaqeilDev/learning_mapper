import os
import json
import logging
from google import genai
from google.genai import types
from schemas import RoadmapSchema, ResourceListSchema, GenerateNextStepResponse

logger = logging.getLogger(__name__)

class AIService:
    def __init__(self, api_key: str = None):
        """
        Initializes the GenAI client using an explicit API key or the 
        GEMINI_API_KEY environment variable.
        """
        key = api_key or os.getenv("GEMINI_API_KEY")
        if key:
            self.client = genai.Client(api_key=key)
        else:
            self.client = genai.Client()

    def generate_roadmap(self, hobby: str, goal: str, experience: str) -> dict:
        prompt = (
            f"You are a knowledge graph architect. Design a dynamic, sparse learning map.\n"
            f"Topic: {hobby}\n"
            f"Ultimate Goal: {goal}\n"
            f"Already Known / Starting Concepts: {experience}\n\n"
            "GENERATION RULES:\n"
            "1. Define a single isolated 'goal_node' representing the Ultimate Goal. Set its status to 'locked'. DO NOT connect any edges to or from it.\n"
            "2. For each known starting concept provided in 'Already Known', create a node with status 'completed'.\n"
            "3. For each 'completed' starting node, generate 2 to 3 immediate next-step neighbor concepts. Set these neighbor nodes to status 'current'.\n"
            "4. Connect each 'completed' starting node to its immediate neighbor concepts using edges.\n"
            "5. DO NOT generate long chains, prerequisites, or connections to the final goal. Leave neighboring concepts with 0 outgoing edges.\n"
            "6. The graph must represent sparse 'knowledge islands' with an isolated goal."
        )

        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=RoadmapSchema,
                temperature=0.3
            ),
        )
        data = json.loads(response.text)
        
        # Ensure the isolated goal_node is explicitly included in the nodes list
        if "goal_node" in data and data["goal_node"]:
            goal_id = data["goal_node"]["id"]
            if not any(n["id"] == goal_id for n in data.get("nodes", [])):
                data.setdefault("nodes", []).append(data["goal_node"])

        return data

    def expand_node(self, node_label: str, roadmap_title: str, existing_ids: list, parent_id: str) -> dict:
        """
        Generates 2 consecutive next-step nodes building upon a finished node.
        """
        next_index = len(existing_ids) + 1
        prompt = (
            f"The learner has completed the topic '{node_label}' within the roadmap '{roadmap_title}'.\n"
            "Generate exactly 2 logical, consecutive next-step topics that build directly upon this subject.\n"
            f"Assign unique IDs starting from 'node_{next_index}'.\n"
            "Mark the immediate next step as 'current' and subsequent steps as 'locked'.\n"
            f"Connect the first new node directly from parent ID '{parent_id}'."
        )

        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=RoadmapSchema,
                temperature=0.4
            ),
        )
        
        # 1. Parse JSON response string into a Python dict
        data = json.loads(response.text)
        
        # 2. Extract raw nodes and edges safely from the parsed dict
        raw_nodes = data.get("nodes", [])
        raw_edges = data.get("edges", [])

        existing_set = set(existing_ids)
        sanitized_nodes = []
        id_map = {} # Map old generated IDs to new guaranteed unique IDs

        for idx, node in enumerate(raw_nodes):
            original_id = node.get("id")
            
            # Make ID unique by incorporating the parent ID or timestamp index if it collides
            new_id = original_id
            if not new_id or new_id in existing_set or new_id in id_map.values():
                slug = original_id or node_label.lower().replace(" ", "_")
                new_id = f"{parent_id}_{slug}_{idx}"

            id_map[original_id] = new_id
            node["id"] = new_id
            sanitized_nodes.append(node)

        # Remap the edges to use updated unique node IDs
        sanitized_edges = []
        for edge in raw_edges:
            from_node = edge.get("from") or edge.get("from_node")
            to_node = edge.get("to") or edge.get("to_node")

            sanitized_edges.append({
                "from": id_map.get(from_node, from_node),
                "to": id_map.get(to_node, to_node)
            })

        return {
            "nodes": sanitized_nodes,
            "edges": sanitized_edges
        }

    def generate_exploration_branch(self, target_label: str, roadmap_title: str, existing_labels: set, completed_history: list) -> dict:
        """
        Generates specialized deep-dive subtopics extending from a specific node.
        """
        prompt = f"""
You are an expert technical mentor and curriculum architect. 
The user is exploring a dynamic roadmap titled "{roadmap_title}".
They want to dive deeper into the concept: "{target_label}".

User's Completed Learning History (Do NOT explain basic concepts they already know):
{', '.join(completed_history) if completed_history else 'None yet.'}

Existing Roadmap Topics (CRITICAL: Do NOT output any topic listed here or synonyms of them):
{', '.join(existing_labels)}

Generate 4 to 6 meaningful, highly distinct subtopics or advanced specializations that extend directly from "{target_label}".
These should represent a natural branching exploration path.

Respond STRICTLY in valid JSON format with the following structure:
{{
  "subtopics": [
    {{
      "label": "Name of Subtopic",
      "is_immediate_prereq": true
    }}
  ]
}}
"""
        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                temperature=0.4
            ),
        )

        cleaned_response = response.text.strip()
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response.split("\n", 1)[1]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response.rsplit("```", 1)[0]
            cleaned_response = cleaned_response.replace("json\n", "", 1).strip()

        return json.loads(cleaned_response)

    def generate_resources(self, topic: str, roadmap_title: str, preferences: list) -> dict:
        """
        Curates learning resources for a specific topic.
        """
        pref_string = ", ".join(preferences) if preferences else "Mixed recommendations"
        prompt = (
            f"Curate a list of 10 high-quality learning resources for the topic: '{topic}' "
            f"within the context of '{roadmap_title}'.\n"
            f"Target resource preferences: {pref_string}.\n\n"
            "Include a diverse mix of platforms such as YouTube, Udemy, GitHub, Official Documentation, "
            "O'Reilly, Interactive coding platforms, and technical blogs.\n"
            "Provide realistic ratings, publication years, accurate durations, and authoritative URLs.\n"
            "Write a concise 2-sentence recommendation reason for each item."
        )

        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                response_schema=ResourceListSchema,
                temperature=0.3
            ),
        )
        return json.loads(response.text)

    def breakdown_step(self, target_node_id: str, last_finished_node_id: str = None) -> list:
        """
        Breaks down a node into granular sub-steps.
        """
        prompt = (
            f"Break down the roadmap step with ID '{target_node_id}' into 2-3 actionable sub-steps. "
            f"Consider previous progress context from node '{last_finished_node_id}' if available. "
            "Return JSON containing an array of objects with 'label' and 'description'."
        )
        
        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                temperature=0.3
            ),
        )
        
        cleaned_response = response.text.strip()
        if cleaned_response.startswith("```"):
            cleaned_response = cleaned_response.split("\n", 1)[1]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response.rsplit("```", 1)[0]
            cleaned_response = cleaned_response.replace("json\n", "", 1).strip()

        parsed = json.loads(cleaned_response)
        if isinstance(parsed, dict) and "sub_steps" in parsed:
            return parsed["sub_steps"]
        return parsed

    def generate_next_step(self, roadmap_title: str, nodes: list, edges: list) -> dict:
        """
        Graph-aware planner that connects existing nodes or creates 1 bridge node
        to reach orphan destination nodes.
        """
        # Format graph summary for prompt
        node_summary = []
        for n in nodes:
            node_summary.append(f"- ID: {n.get('id')} | Label: '{n.get('label')}' | Status: {n.get('status')}")
        
        edge_summary = []
        for e in edges:
            edge_summary.append(f"- {e.get('from')} -> {e.get('to')}")

        prompt = f"""
        You are an intelligent Graph Roadmap Planner for the roadmap: "{roadmap_title}".

        CURRENT GRAPH STRUCTURE:
        NODES:
        {chr(10).join(node_summary)}

        EDGES:
        {chr(10).join(edge_summary) if edge_summary else "No edges yet."}

        ALGORITHM INSTRUCTIONS:
        1. ANALYZE GRAPH & FIND ORPHANS:
           - Identify orphan nodes (nodes with 0 incoming edges that represent target goals or disconnected objectives).
           - Identify active/completed source nodes that can advance the path.

        2. DIRECT CONNECTION CHECK:
           - Can an existing completed/active node naturally fulfill the prerequisites for an orphan target node?
           - If YES: Set "direct_connect": true, "new_node": null, and return the edge connecting them in "new_edges". DO NOT generate a new node.

        3. GENERATE BRIDGING NODE (If Direct Connection is NOT possible):
           - Generate EXACTLY ONE meaningful bridge node that moves the learner closer to an orphan target node.
           - Avoid tiny steps and huge leaps.

        4. STRICT SEMANTIC DEDUPLICATION:
           - Compare the proposed topic against ALL existing node labels: {[n.get('label') for n in nodes]}.
           - DO NOT generate nodes that overlap heavily in scope, mean the same thing, or differ only by phrasing (e.g., 'Loops' vs 'For Loops').

        5. RETURN EDGES:
           - Connect the existing source node -> new_node, and if applicable, new_node -> orphan_target.
        """

        # Call Gemini model using structured output schema
        response = self.client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': GenerateNextStepResponse,
                'temperature': 0.2
            }
        )
        return json.loads(response.text)