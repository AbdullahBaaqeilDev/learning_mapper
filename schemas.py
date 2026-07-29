from pydantic import BaseModel, Field
from typing import List, Literal

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