from pydantic import BaseModel, Field
from typing import List, Literal, Optional


class NextStepNode(BaseModel):
    id: str = Field(description="Unique snake_case ID for the new node, e.g., 'file_persistence'")
    label: str = Field(description="Concise topic label (2-4 words)")
    status: str = Field(default="current", description="Status of the node: 'current' or 'locked'")

class NextStepEdge(BaseModel):
    from_node: str = Field(alias="from", description="ID of the source node")
    to_node: str = Field(alias="to", description="ID of the target node")

    class Config:
        populate_by_name = True

class GenerateNextStepResponse(BaseModel):
    direct_connect: bool = Field(description="True if existing nodes were directly connected without creating a new node")
    reasoning: str = Field(description="Brief explanation of why a direct connection was made or why this bridge node was chosen")
    new_node: Optional[NextStepNode] = Field(default=None, description="The single bridge node created, or null if direct_connect is true")
    new_edges: List[NextStepEdge] = Field(description="List of edges created (e.g. source -> new_node, new_node -> orphan_target, or direct source -> orphan_target)")
class NodeSchema(BaseModel):
    id: str = Field(description="Unique alphanumeric identifier, e.g., 'node_1'")
    label: str = Field(description="Concise topic title, 2 to 5 words")
    status: Literal["completed", "current", "locked"] = Field(
        description="Current learning state of the node"
    )

class EdgeSchema(BaseModel):
    from_node: str = Field(validation_alias="from", serialization_alias="from", description="Source node ID")
    to_node: str = Field(alias="to", description="Target node ID")

    class Config:
        populate_by_name = True
        
class RoadmapNode(BaseModel):
    id: str = Field(description="Unique node identifier, e.g., 'node_1', 'goal_node'")
    label: str = Field(description="Short title of the concept or milestone")
    status: str = Field(description="Initial status: 'completed', 'current', or 'locked'")

class RoadmapEdge(BaseModel):
    from_node: str = Field(alias="from", description="Source node ID")
    to_node: str = Field(alias="to", description="Target node ID")

class RoadmapSchema(BaseModel):
    roadmap_title: str = Field(description="Concise title for this learning journey")
    goal_node: RoadmapNode = Field(description="The isolated target objective node")
    nodes: List[RoadmapNode] = Field(description="All generated nodes including starting islands")
    edges: List[RoadmapEdge] = Field(description="Edges connecting starting concepts to immediate neighbors only")

class ResourceItemSchema(BaseModel):
    id: str = Field(description="Unique string identifier")
    title: str = Field(description="Title of the educational resource")
    platform: str = Field(description="Platform such as YouTube, Udemy, GitHub, Official Docs, O'Reilly, etc.")
    resource_type: str = Field(description="Category such as Video Course, Documentation, Interactive, GitHub Repository, Book, Article")
    difficulty: Literal["Beginner", "Intermediate", "Advanced"]
    duration: str = Field(description="Estimated completion time, e.g., '4 hours', '3 weeks', 'Self-paced'")
    price_type: Literal["Free", "Paid"]
    price_detail: str = Field(description="Exact pricing or 'Free'")
    rating: float = Field(description="Average rating out of 5.0; use 0.0 if unrated")
    url: str = Field(description="Direct URL or authoritative search query link")
    recommendation_reason: str = Field(description="Concise 2-sentence explanation of why this resource fits the topic")
    publication_year: int = Field(description="Year of release or last major revision")

class ResourceListSchema(BaseModel):
    topic: str
    resources: List[ResourceItemSchema]

class GoalExpansionNode(BaseModel):
    id: str = Field(description="Unique snake_case ID for the new node, e.g. 'advanced_async'")
    label: str = Field(description="Concise topic label (2-4 words)")
    status: str = Field(default="locked", description="Status of node: 'current' for entry point, 'locked' for downstream")

class GoalExpansionEdge(BaseModel):
    from_node: str = Field(alias="from", description="Source node ID")
    to_node: str = Field(alias="to", description="Target node ID")

    class Config:
        populate_by_name = True

class GoalExpansionResponse(BaseModel):
    reasoning: str = Field(description="Explanation of why this entry node was chosen and how the path bridges from previous knowledge")
    entry_node_id: str = Field(description="ID of the new node that logically connects directly from the previous goal")
    new_nodes: List[GoalExpansionNode] = Field(description="List of newly created nodes for the expansion")
    new_edges: List[GoalExpansionEdge] = Field(description="List of new edges forming the new branch")