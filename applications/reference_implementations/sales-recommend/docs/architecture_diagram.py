"""
High-quality architecture diagram for the Investment Research and Risk Accelerator.

Renders docs/architecture.png using the `diagrams` library (AWS service icons,
orthogonal edge routing). Node/edge inventory follows architecture_diagram.md.

Run:
    /tmp/diagvenv/bin/python docs/architecture_diagram.py
"""

from diagrams import Diagram, Cluster, Edge
from diagrams.aws.network import CloudFront, ElbApplicationLoadBalancer
from diagrams.aws.compute import Fargate, Lambda, EC2ContainerRegistry
from diagrams.aws.devtools import Codebuild
from diagrams.aws.integration import Eventbridge
from diagrams.aws.storage import S3
from diagrams.aws.analytics import ElasticsearchService
from diagrams.aws.management import SystemsManagerParameterStore
from diagrams.aws.ml import Bedrock
from diagrams.onprem.vcs import Github
from diagrams.aws.general import User

graph_attr = {
    "splines": "ortho",     # clean right-angle lines
    "nodesep": "0.7",
    "ranksep": "1.3",
    "pad": "0.6",
    "fontsize": "12",
    "fontname": "Helvetica",
    "bgcolor": "white",
    "dpi": "160",
}
node_attr = {"fontsize": "11", "fontname": "Helvetica"}
edge_attr = {"fontsize": "10", "fontname": "Helvetica"}

# Edge styles per flow
Q = {"color": "#1F3B57", "penwidth": "2.0"}          # Query flow (solid)
D = {"color": "#D35400", "style": "dashed", "penwidth": "1.8"}  # Data production
C = {"color": "#9AA0A6", "style": "dotted"}          # Cross-cutting

with Diagram(
    "Investment Research and Risk Accelerator — Architecture",
    filename="docs/architecture",
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    user = User("End user\n(business leader)")

    with Cluster("Edge / Auth"):
        cf = CloudFront("CloudFront\n+ Basic Auth Fn")
        ssm = SystemsManagerParameterStore("Auth creds")

    with Cluster("VPC"):
        alb = ElbApplicationLoadBalancer("Application\nLoad Balancer")
        ecs = Fargate("ECS Fargate\nNext.js UI + API")
    ecr = EC2ContainerRegistry("ECR\n(UI image)")

    with Cluster("Agent"):
        agentcore = Bedrock("AgentCore Runtime\n(Strands agent)")
        claude = Bedrock("Claude Sonnet 4.6")

    with Cluster("Knowledge Base (shared hub)"):
        kb = Bedrock("Knowledge Base")
        titan = Bedrock("Titan\nEmbeddings V2")
        aoss = ElasticsearchService("OpenSearch\nServerless")
        kbbucket = S3("KB data source\n(chunking = NONE)")

    with Cluster("Data Production"):
        github = Github("Repos (GitHub)")
        srcbucket = S3("Wiki source\ncode + repos.txt")
        scheduler = Eventbridge("EventBridge Scheduler\n(fires ~15m after change)")
        dispatch = Lambda("Dispatch\n(fan-out)")
        codebuild = Codebuild("Wiki Generator")
        synth = Bedrock("Claude\n(synthesis)")

    # ---- Query flow (solid) ----
    user >> Edge(label="HTTPS", **Q) >> cf
    cf >> Edge(label="origin secret", **Q) >> alb
    alb >> Edge(**Q) >> ecs
    ecs >> Edge(label="InvokeAgentRuntime", **Q) >> agentcore
    agentcore >> Edge(label="generate", **Q) >> claude
    agentcore >> Edge(label="Retrieve", **Q) >> kb
    kb >> Edge(label="vector search", **Q) >> aoss

    # ---- Data production flow (dashed) ----
    scheduler >> Edge(label="invoke (after delay)", **D) >> dispatch
    dispatch >> Edge(label="StartBuild / URL", **D) >> codebuild
    srcbucket >> Edge(label="build source", **D) >> codebuild
    github >> Edge(label="clone", **D) >> codebuild
    codebuild >> Edge(label="synthesize", **D) >> synth
    codebuild >> Edge(label="write .md + metadata", **D) >> kbbucket
    codebuild >> Edge(label="StartIngestionJob", **D) >> kb
    kb >> Edge(label="read", **D) >> kbbucket
    kb >> Edge(label="embed", **D) >> titan
    kb >> Edge(label="write vectors", **D) >> aoss

    # ---- Cross-cutting (dotted) ----
    ssm >> Edge(label="creds (deploy)", **C) >> cf
    ecr >> Edge(label="image", **C) >> ecs
