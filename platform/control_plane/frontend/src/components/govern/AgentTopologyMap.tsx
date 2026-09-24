/**
 * AgentTopologyMap - Visual agent topology/relationship map
 *
 * Displays a graph visualization showing:
 * - Agent nodes (with status indicator: healthy/warning/error)
 * - Tool nodes (what tools agents use)
 * - MCP Server nodes
 * - Data source nodes
 * - User/role nodes (who can invoke agents)
 * - Agent-to-agent connections (A2A trust)
 *
 * Similar to Microsoft Agent365's "Agents Map" feature.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Icon, type IconName } from './icons';
import { rowButtonProps } from './a11y';
import { MockDataBadge } from './DataSourceIndicator';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

type NodeType = 'agent' | 'tool' | 'data-source' | 'user' | 'mcp-server';
type NodeStatus = 'healthy' | 'warning' | 'error' | 'inactive';
type RiskTier = 'low' | 'medium' | 'high' | 'critical';
type EdgeType = 'invokes' | 'uses' | 'trusts' | 'accesses' | 'connects';
type LayoutMode = 'force' | 'hierarchical' | 'circular';

interface TopologyNode {
  id: string;
  type: NodeType;
  label: string;
  sublabel?: string;
  status: NodeStatus;
  riskTier?: RiskTier;
  recentActivity?: boolean;
  metadata?: Record<string, string | number>;
  // Position (set during layout)
  x: number;
  y: number;
}

interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  active?: boolean;
  label?: string;
}

interface FilterState {
  showAgents: boolean;
  showTools: boolean;
  showDataSources: boolean;
  showUsers: boolean;
  showMcpServers: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Styling Constants
// ═══════════════════════════════════════════════════════════════════════════════

const NODE_COLORS: Record<NodeType, { fill: string; stroke: string; text: string }> = {
  agent: { fill: '#eff6ff', stroke: '#3b82f6', text: '#1e40af' },
  tool: { fill: '#fef3c7', stroke: '#f59e0b', text: '#92400e' },
  'data-source': { fill: '#ecfdf5', stroke: '#10b981', text: '#065f46' },
  user: { fill: '#f3e8ff', stroke: '#8b5cf6', text: '#5b21b6' },
  'mcp-server': { fill: '#fce7f3', stroke: '#ec4899', text: '#9d174d' },
};

const STATUS_COLORS: Record<NodeStatus, string> = {
  healthy: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  inactive: '#94a3b8',
};

const RISK_TIER_COLORS: Record<RiskTier, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#ef4444',
};

const EDGE_COLORS: Record<EdgeType, string> = {
  invokes: '#8b5cf6',
  uses: '#3b82f6',
  trusts: '#10b981',
  accesses: '#f59e0b',
  connects: '#ec4899',
};

const NODE_ICONS: Record<NodeType, IconName> = {
  agent: 'cpu-chip',
  tool: 'wrench',
  'data-source': 'circle-stack',
  user: 'user',
  'mcp-server': 'server-stack',
};

// ═══════════════════════════════════════════════════════════════════════════════
// Mock Data - Sample Topology
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_NODES: Omit<TopologyNode, 'x' | 'y'>[] = [
  // Agents
  { id: 'agent-1', type: 'agent', label: 'Fraud Detection', sublabel: 'Bedrock AgentCore', status: 'healthy', riskTier: 'high', recentActivity: true, metadata: { invocations: 38900, latency: '1.2s' } },
  { id: 'agent-2', type: 'agent', label: 'Customer Service', sublabel: 'Bedrock AgentCore', status: 'healthy', riskTier: 'medium', recentActivity: true, metadata: { invocations: 45200, latency: '0.8s' } },
  { id: 'agent-3', type: 'agent', label: 'KYC Banking', sublabel: 'Bedrock AgentCore', status: 'warning', riskTier: 'high', metadata: { invocations: 8200, latency: '2.1s' } },
  { id: 'agent-4', type: 'agent', label: 'Trading Assistant', sublabel: 'Bedrock AgentCore', status: 'error', riskTier: 'critical', metadata: { invocations: 12800, latency: '3.4s' } },
  { id: 'agent-5', type: 'agent', label: 'Credit Risk', sublabel: 'Bedrock AgentCore', status: 'healthy', riskTier: 'medium', metadata: { invocations: 9400, latency: '1.5s' } },
  { id: 'agent-6', type: 'agent', label: 'Claims Management', sublabel: 'Strands Agent', status: 'inactive', riskTier: 'low', metadata: { invocations: 0, latency: '-' } },

  // Tools
  { id: 'tool-1', type: 'tool', label: 'Account Lookup', sublabel: 'read-only', status: 'healthy', metadata: { riskLevel: 'low' } },
  { id: 'tool-2', type: 'tool', label: 'Transaction API', sublabel: 'write', status: 'healthy', metadata: { riskLevel: 'high' } },
  { id: 'tool-3', type: 'tool', label: 'KYC Verification', sublabel: 'execute', status: 'healthy', metadata: { riskLevel: 'medium' } },
  { id: 'tool-4', type: 'tool', label: 'Market Data Feed', sublabel: 'read-only', status: 'warning', metadata: { riskLevel: 'low' } },
  { id: 'tool-5', type: 'tool', label: 'Email Sender', sublabel: 'execute', status: 'healthy', metadata: { riskLevel: 'medium' } },
  { id: 'tool-6', type: 'tool', label: 'Compliance Check', sublabel: 'execute', status: 'healthy', metadata: { riskLevel: 'high' } },

  // Data Sources
  { id: 'ds-1', type: 'data-source', label: 'Customer DB', sublabel: 'PostgreSQL', status: 'healthy', metadata: { sensitivity: 'PII' } },
  { id: 'ds-2', type: 'data-source', label: 'Transaction History', sublabel: 'DynamoDB', status: 'healthy', metadata: { sensitivity: 'Financial' } },
  { id: 'ds-3', type: 'data-source', label: 'Market Data', sublabel: 'S3 + Athena', status: 'healthy', metadata: { sensitivity: 'Public' } },
  { id: 'ds-4', type: 'data-source', label: 'Risk Scores KB', sublabel: 'Bedrock KB', status: 'healthy', metadata: { sensitivity: 'Internal' } },

  // Users/Roles
  { id: 'user-1', type: 'user', label: 'Fraud Analysts', sublabel: 'IAM Role', status: 'healthy', metadata: { members: 12 } },
  { id: 'user-2', type: 'user', label: 'Customer Reps', sublabel: 'IAM Role', status: 'healthy', metadata: { members: 45 } },
  { id: 'user-3', type: 'user', label: 'Risk Officers', sublabel: 'IAM Role', status: 'healthy', metadata: { members: 8 } },
  { id: 'user-4', type: 'user', label: 'Traders', sublabel: 'IAM Role', status: 'warning', metadata: { members: 24 } },

  // MCP Servers
  { id: 'mcp-1', type: 'mcp-server', label: 'Core Banking MCP', sublabel: 'production', status: 'healthy', metadata: { tools: 12, uptime: '99.9%' } },
  { id: 'mcp-2', type: 'mcp-server', label: 'Market Data MCP', sublabel: 'production', status: 'warning', metadata: { tools: 8, uptime: '99.2%' } },
  { id: 'mcp-3', type: 'mcp-server', label: 'Compliance MCP', sublabel: 'staging', status: 'healthy', metadata: { tools: 5, uptime: '99.8%' } },
];

const MOCK_EDGES: TopologyEdge[] = [
  // User -> Agent (invokes)
  { id: 'e1', source: 'user-1', target: 'agent-1', type: 'invokes', active: true },
  { id: 'e2', source: 'user-2', target: 'agent-2', type: 'invokes', active: true },
  { id: 'e3', source: 'user-3', target: 'agent-3', type: 'invokes' },
  { id: 'e4', source: 'user-3', target: 'agent-5', type: 'invokes' },
  { id: 'e5', source: 'user-4', target: 'agent-4', type: 'invokes' },

  // Agent -> Tool (uses)
  { id: 'e6', source: 'agent-1', target: 'tool-1', type: 'uses', active: true },
  { id: 'e7', source: 'agent-1', target: 'tool-2', type: 'uses', active: true },
  { id: 'e8', source: 'agent-2', target: 'tool-1', type: 'uses' },
  { id: 'e9', source: 'agent-2', target: 'tool-5', type: 'uses' },
  { id: 'e10', source: 'agent-3', target: 'tool-3', type: 'uses' },
  { id: 'e11', source: 'agent-4', target: 'tool-4', type: 'uses' },
  { id: 'e12', source: 'agent-4', target: 'tool-2', type: 'uses' },
  { id: 'e13', source: 'agent-5', target: 'tool-6', type: 'uses' },

  // Agent -> Data Source (accesses)
  { id: 'e14', source: 'agent-1', target: 'ds-1', type: 'accesses', active: true },
  { id: 'e15', source: 'agent-1', target: 'ds-2', type: 'accesses' },
  { id: 'e16', source: 'agent-2', target: 'ds-1', type: 'accesses' },
  { id: 'e17', source: 'agent-3', target: 'ds-1', type: 'accesses' },
  { id: 'e18', source: 'agent-4', target: 'ds-3', type: 'accesses' },
  { id: 'e19', source: 'agent-5', target: 'ds-4', type: 'accesses' },

  // Agent -> MCP Server (connects)
  { id: 'e20', source: 'agent-1', target: 'mcp-1', type: 'connects' },
  { id: 'e21', source: 'agent-2', target: 'mcp-1', type: 'connects' },
  { id: 'e22', source: 'agent-3', target: 'mcp-1', type: 'connects' },
  { id: 'e23', source: 'agent-4', target: 'mcp-2', type: 'connects' },
  { id: 'e24', source: 'agent-5', target: 'mcp-3', type: 'connects' },

  // Agent -> Agent (trusts / A2A)
  { id: 'e25', source: 'agent-1', target: 'agent-5', type: 'trusts', label: 'L2' },
  { id: 'e26', source: 'agent-2', target: 'agent-3', type: 'trusts', label: 'L1' },
  { id: 'e27', source: 'agent-5', target: 'agent-1', type: 'trusts', label: 'L3' },
];

// ═══════════════════════════════════════════════════════════════════════════════
// Layout Algorithms
// ═══════════════════════════════════════════════════════════════════════════════

function layoutForceDirected(nodes: TopologyNode[], edges: TopologyEdge[], width: number, height: number): TopologyNode[] {
  // Group nodes by type for initial positioning
  const byType: Record<NodeType, TopologyNode[]> = {
    agent: [],
    tool: [],
    'data-source': [],
    user: [],
    'mcp-server': [],
  };

  nodes.forEach(n => byType[n.type].push(n));

  // Initial positions by type (rough layering)
  const centerX = width / 2;

  // Place users on left, agents center, tools/data/mcp on right in layers
  const positions: TopologyNode[] = [];

  // Users - left side
  byType.user.forEach((n, i) => {
    positions.push({
      ...n,
      x: 80,
      y: 100 + i * 90,
    });
  });

  // Agents - center
  byType.agent.forEach((n, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    positions.push({
      ...n,
      x: centerX - 80 + col * 160,
      y: 80 + row * 120,
    });
  });

  // Tools - right side top
  byType.tool.forEach((n, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    positions.push({
      ...n,
      x: width - 180 + col * 100,
      y: 60 + row * 80,
    });
  });

  // Data sources - right side bottom
  byType['data-source'].forEach((n, i) => {
    positions.push({
      ...n,
      x: width - 130,
      y: 320 + i * 70,
    });
  });

  // MCP servers - bottom center
  byType['mcp-server'].forEach((n, i) => {
    positions.push({
      ...n,
      x: 200 + i * 200,
      y: height - 80,
    });
  });

  // Simple force simulation (a few iterations)
  const result = [...positions];
  const iterations = 50;
  const repulsion = 5000;
  const attraction = 0.05;

  for (let iter = 0; iter < iterations; iter++) {
    const forces: { x: number; y: number }[] = result.map(() => ({ x: 0, y: 0 }));

    // Repulsion between all nodes
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const dx = result[j].x - result[i].x;
        const dy = result[j].y - result[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        forces[i].x -= fx;
        forces[i].y -= fy;
        forces[j].x += fx;
        forces[j].y += fy;
      }
    }

    // Attraction along edges
    edges.forEach(edge => {
      const sourceIdx = result.findIndex(n => n.id === edge.source);
      const targetIdx = result.findIndex(n => n.id === edge.target);
      if (sourceIdx >= 0 && targetIdx >= 0) {
        const dx = result[targetIdx].x - result[sourceIdx].x;
        const dy = result[targetIdx].y - result[sourceIdx].y;
        forces[sourceIdx].x += dx * attraction;
        forces[sourceIdx].y += dy * attraction;
        forces[targetIdx].x -= dx * attraction;
        forces[targetIdx].y -= dy * attraction;
      }
    });

    // Apply forces with damping
    const damping = 0.8 - (iter / iterations) * 0.6;
    result.forEach((node, i) => {
      node.x += forces[i].x * damping;
      node.y += forces[i].y * damping;
      // Keep within bounds
      node.x = Math.max(60, Math.min(width - 60, node.x));
      node.y = Math.max(40, Math.min(height - 40, node.y));
    });
  }

  return result;
}

function layoutHierarchical(nodes: TopologyNode[], _edges: TopologyEdge[], width: number, height: number): TopologyNode[] {
  // Layer by type: users -> agents -> tools/data/mcp
  const layers: NodeType[][] = [
    ['user'],
    ['agent'],
    ['tool', 'mcp-server'],
    ['data-source'],
  ];

  const layerY = [80, 200, 340, 460];
  const result: TopologyNode[] = [];

  layers.forEach((typeList, layerIdx) => {
    const layerNodes = nodes.filter(n => typeList.includes(n.type));
    const count = layerNodes.length;
    const spacing = Math.min(150, (width - 120) / Math.max(count, 1));
    const startX = (width - (count - 1) * spacing) / 2;

    layerNodes.forEach((n, i) => {
      result.push({
        ...n,
        x: startX + i * spacing,
        y: layerY[layerIdx] ?? height - 100,
      });
    });
  });

  return result;
}

function layoutCircular(nodes: TopologyNode[], _edges: TopologyEdge[], width: number, height: number): TopologyNode[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 80;

  // Sort by type so same types cluster
  const sorted = [...nodes].sort((a, b) => a.type.localeCompare(b.type));

  return sorted.map((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
    return {
      ...n,
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Node Shape Components (SVG)
// ═══════════════════════════════════════════════════════════════════════════════

interface NodeShapeProps {
  node: TopologyNode;
  selected: boolean;
  highlighted: boolean;
  onClick: () => void;
  onHover: (hovering: boolean) => void;
}

function AgentNodeShape({ node, selected, highlighted, onClick, onHover }: NodeShapeProps) {
  const colors = NODE_COLORS.agent;
  const statusColor = STATUS_COLORS[node.status];
  const riskColor = node.riskTier ? RISK_TIER_COLORS[node.riskTier] : undefined;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      opacity={highlighted || selected ? 1 : 0.4}
    >
      {/* Pulse animation for recent activity */}
      {node.recentActivity && (
        <circle r="36" fill={colors.stroke} opacity="0.15">
          <animate attributeName="r" values="36;42;36" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.15;0.05;0.15" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      {/* Main circle */}
      <circle
        r="32"
        fill={colors.fill}
        stroke={selected ? '#1e40af' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      {/* Status indicator */}
      <circle cx="22" cy="-22" r="8" fill={statusColor} stroke="white" strokeWidth="2" />
      {/* Risk tier indicator */}
      {riskColor && (
        <rect x="-12" y="18" width="24" height="10" rx="5" fill={riskColor} />
      )}
      {/* Label */}
      <text y="50" textAnchor="middle" fontSize="11" fontWeight="600" fill={colors.text}>
        {node.label.length > 16 ? node.label.slice(0, 14) + '...' : node.label}
      </text>
      <text y="62" textAnchor="middle" fontSize="9" fill="#64748b">
        {node.sublabel}
      </text>
    </g>
  );
}

function ToolNodeShape({ node, selected, highlighted, onClick, onHover }: NodeShapeProps) {
  const colors = NODE_COLORS.tool;
  const statusColor = STATUS_COLORS[node.status];

  // Hexagon points (centered at 0,0)
  const size = 28;
  const points = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    return `${size * Math.cos(angle)},${size * Math.sin(angle)}`;
  }).join(' ');

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      opacity={highlighted || selected ? 1 : 0.4}
    >
      <polygon
        points={points}
        fill={colors.fill}
        stroke={selected ? '#92400e' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      <circle cx="18" cy="-18" r="6" fill={statusColor} stroke="white" strokeWidth="1.5" />
      <text y="44" textAnchor="middle" fontSize="10" fontWeight="600" fill={colors.text}>
        {node.label.length > 14 ? node.label.slice(0, 12) + '...' : node.label}
      </text>
      <text y="55" textAnchor="middle" fontSize="8" fill="#64748b">
        {node.sublabel}
      </text>
    </g>
  );
}

function DataSourceNodeShape({ node, selected, highlighted, onClick, onHover }: NodeShapeProps) {
  const colors = NODE_COLORS['data-source'];
  const statusColor = STATUS_COLORS[node.status];

  // Cylinder shape
  const width = 50;
  const height = 36;
  const ellipseRy = 8;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      opacity={highlighted || selected ? 1 : 0.4}
    >
      {/* Cylinder body */}
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        fill={colors.fill}
        stroke={selected ? '#065f46' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
        rx="4"
      />
      {/* Top ellipse */}
      <ellipse
        cx="0"
        cy={-height / 2}
        rx={width / 2}
        ry={ellipseRy}
        fill={colors.fill}
        stroke={selected ? '#065f46' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      {/* Bottom ellipse (visible part) */}
      <path
        d={`M ${-width / 2} ${height / 2} Q 0 ${height / 2 + ellipseRy} ${width / 2} ${height / 2}`}
        fill="none"
        stroke={selected ? '#065f46' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      <circle cx="20" cy="-16" r="6" fill={statusColor} stroke="white" strokeWidth="1.5" />
      <text y="38" textAnchor="middle" fontSize="10" fontWeight="600" fill={colors.text}>
        {node.label.length > 14 ? node.label.slice(0, 12) + '...' : node.label}
      </text>
      <text y="49" textAnchor="middle" fontSize="8" fill="#64748b">
        {node.sublabel}
      </text>
    </g>
  );
}

function UserNodeShape({ node, selected, highlighted, onClick, onHover }: NodeShapeProps) {
  const colors = NODE_COLORS.user;
  const statusColor = STATUS_COLORS[node.status];

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      opacity={highlighted || selected ? 1 : 0.4}
    >
      <rect
        x="-40"
        y="-20"
        width="80"
        height="40"
        rx="6"
        fill={colors.fill}
        stroke={selected ? '#5b21b6' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      <circle cx="28" cy="-14" r="6" fill={statusColor} stroke="white" strokeWidth="1.5" />
      <text y="4" textAnchor="middle" fontSize="11" fontWeight="600" fill={colors.text}>
        {node.label.length > 12 ? node.label.slice(0, 10) + '...' : node.label}
      </text>
      <text y="36" textAnchor="middle" fontSize="9" fill="#64748b">
        {node.sublabel}
      </text>
    </g>
  );
}

function McpServerNodeShape({ node, selected, highlighted, onClick, onHover }: NodeShapeProps) {
  const colors = NODE_COLORS['mcp-server'];
  const statusColor = STATUS_COLORS[node.status];

  // Diamond shape
  const size = 30;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      style={{ cursor: 'pointer' }}
      opacity={highlighted || selected ? 1 : 0.4}
    >
      <polygon
        points={`0,${-size} ${size},0 0,${size} ${-size},0`}
        fill={colors.fill}
        stroke={selected ? '#9d174d' : colors.stroke}
        strokeWidth={selected ? 3 : 2}
      />
      <circle cx="18" cy="-18" r="6" fill={statusColor} stroke="white" strokeWidth="1.5" />
      <text y="48" textAnchor="middle" fontSize="10" fontWeight="600" fill={colors.text}>
        {node.label.length > 14 ? node.label.slice(0, 12) + '...' : node.label}
      </text>
      <text y="59" textAnchor="middle" fontSize="8" fill="#64748b">
        {node.sublabel}
      </text>
    </g>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════

interface AgentTopologyMapProps {
  className?: string;
}

export default function AgentTopologyMap({ className }: AgentTopologyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 560 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('force');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [filters, setFilters] = useState<FilterState>({
    showAgents: true,
    showTools: true,
    showDataSources: true,
    showUsers: true,
    showMcpServers: true,
  });

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width || 900,
          height: entry.contentRect.height || 560,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Apply filters to nodes
  const filteredNodes = useMemo(() => {
    return MOCK_NODES.filter(n => {
      if (n.type === 'agent' && !filters.showAgents) return false;
      if (n.type === 'tool' && !filters.showTools) return false;
      if (n.type === 'data-source' && !filters.showDataSources) return false;
      if (n.type === 'user' && !filters.showUsers) return false;
      if (n.type === 'mcp-server' && !filters.showMcpServers) return false;
      return true;
    });
  }, [filters]);

  // Apply search filter
  const searchFilteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return filteredNodes;
    const q = searchQuery.toLowerCase();
    return filteredNodes.filter(n =>
      n.label.toLowerCase().includes(q) ||
      n.sublabel?.toLowerCase().includes(q)
    );
  }, [filteredNodes, searchQuery]);

  // Filter edges based on visible nodes
  const filteredEdges = useMemo(() => {
    const visibleIds = new Set(searchFilteredNodes.map(n => n.id));
    return MOCK_EDGES.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
  }, [searchFilteredNodes]);

  // Layout nodes
  const layoutedNodes = useMemo(() => {
    const baseNodes: TopologyNode[] = searchFilteredNodes.map(n => ({ ...n, x: 0, y: 0 }));

    switch (layoutMode) {
      case 'force':
        return layoutForceDirected(baseNodes, filteredEdges, dimensions.width, dimensions.height);
      case 'hierarchical':
        return layoutHierarchical(baseNodes, filteredEdges, dimensions.width, dimensions.height);
      case 'circular':
        return layoutCircular(baseNodes, filteredEdges, dimensions.width, dimensions.height);
      default:
        return baseNodes;
    }
  }, [searchFilteredNodes, filteredEdges, layoutMode, dimensions]);

  // Get connected nodes for highlighting
  const connectedNodeIds = useMemo(() => {
    const focusId = hoveredNode || selectedNode;
    if (!focusId) return new Set<string>();
    const connected = new Set<string>([focusId]);
    filteredEdges.forEach(e => {
      if (e.source === focusId) connected.add(e.target);
      if (e.target === focusId) connected.add(e.source);
    });
    return connected;
  }, [hoveredNode, selectedNode, filteredEdges]);

  // Selected node details
  const selectedNodeData = useMemo(() => {
    if (!selectedNode) return null;
    return layoutedNodes.find(n => n.id === selectedNode) ?? null;
  }, [selectedNode, layoutedNodes]);

  // Get edges for selected node
  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode) return [];
    return filteredEdges.filter(e => e.source === selectedNode || e.target === selectedNode);
  }, [selectedNode, filteredEdges]);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(2, z + 0.2));
  const handleZoomOut = () => setZoom(z => Math.max(0.5, z - 0.2));
  const handleZoomReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // Focus on search result
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const match = searchFilteredNodes.find(n =>
        n.label.toLowerCase().includes(query.toLowerCase())
      );
      if (match) {
        setSelectedNode(match.id);
        // Center on the node
        const node = layoutedNodes.find(n => n.id === match.id);
        if (node) {
          setPan({
            x: dimensions.width / 2 - node.x * zoom,
            y: dimensions.height / 2 - node.y * zoom,
          });
        }
      }
    }
  };

  // Render node by type
  const renderNode = (node: TopologyNode) => {
    const props: NodeShapeProps = {
      node,
      selected: selectedNode === node.id,
      highlighted: connectedNodeIds.size === 0 || connectedNodeIds.has(node.id),
      onClick: () => setSelectedNode(selectedNode === node.id ? null : node.id),
      onHover: (h) => setHoveredNode(h ? node.id : null),
    };

    switch (node.type) {
      case 'agent':
        return <AgentNodeShape key={node.id} {...props} />;
      case 'tool':
        return <ToolNodeShape key={node.id} {...props} />;
      case 'data-source':
        return <DataSourceNodeShape key={node.id} {...props} />;
      case 'user':
        return <UserNodeShape key={node.id} {...props} />;
      case 'mcp-server':
        return <McpServerNodeShape key={node.id} {...props} />;
    }
  };

  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 shadow-sm ${className ?? ''}`}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-blue-50/30">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">Agent Topology Map</h1>
            {/* Honesty gate: this map renders sample topology (MOCK_NODES/MOCK_EDGES),
                not live agents/X-Ray service graph — disclose it. */}
            <MockDataBadge integration="Live agent graph + X-Ray service map" />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Map the agentic estate — relationships among agents, tools, data sources, users, and MCP servers in one interactive graph.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
            {layoutedNodes.length} nodes | {filteredEdges.length} connections
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap items-center gap-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px] max-w-xs">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search nodes..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
            />
          </div>
        </div>

        {/* Layout selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Layout:</span>
          <div className="flex gap-1">
            {(['force', 'hierarchical', 'circular'] as LayoutMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setLayoutMode(mode)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition capitalize ${
                  layoutMode === mode
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Show:</span>
          <div className="flex gap-1">
            {[
              { key: 'showAgents' as const, label: 'Agents', icon: 'cpu-chip' as IconName },
              { key: 'showTools' as const, label: 'Tools', icon: 'wrench' as IconName },
              { key: 'showDataSources' as const, label: 'Data', icon: 'circle-stack' as IconName },
              { key: 'showUsers' as const, label: 'Users', icon: 'user' as IconName },
              { key: 'showMcpServers' as const, label: 'MCP', icon: 'server-stack' as IconName },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilters(prev => ({ ...prev, [f.key]: !prev[f.key] }))}
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg transition ${
                  filters[f.key]
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-slate-100 text-slate-400 border border-slate-200'
                }`}
                title={f.label}
              >
                <Icon name={f.icon} className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={handleZoomOut} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Zoom out">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
          </button>
          <span className="text-xs text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={handleZoomIn} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded" title="Zoom in">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          </button>
          <button onClick={handleZoomReset} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded ml-1" title="Reset view">
            <Icon name="arrow-path" className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Graph + Details Panel */}
      <div className="flex" style={{ height: '560px' }}>
        {/* Graph Canvas */}
        <div
          ref={containerRef}
          className="flex-1 bg-slate-50 overflow-hidden relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <svg
            width={dimensions.width}
            height={dimensions.height}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center',
            }}
          >
            {/* Edge definitions */}
            <defs>
              <marker id="arrowhead-invokes" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLORS.invokes} />
              </marker>
              <marker id="arrowhead-uses" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLORS.uses} />
              </marker>
              <marker id="arrowhead-trusts" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLORS.trusts} />
              </marker>
              <marker id="arrowhead-accesses" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLORS.accesses} />
              </marker>
              <marker id="arrowhead-connects" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill={EDGE_COLORS.connects} />
              </marker>
            </defs>

            {/* Edges */}
            {filteredEdges.map(edge => {
              const source = layoutedNodes.find(n => n.id === edge.source);
              const target = layoutedNodes.find(n => n.id === edge.target);
              if (!source || !target) return null;

              const isHighlighted = connectedNodeIds.size === 0 ||
                (connectedNodeIds.has(edge.source) && connectedNodeIds.has(edge.target));
              const color = EDGE_COLORS[edge.type];

              return (
                <g key={edge.id}>
                  <line
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke={color}
                    strokeWidth={isHighlighted ? 2 : 1}
                    strokeDasharray={edge.type === 'trusts' ? '6 3' : undefined}
                    markerEnd={`url(#arrowhead-${edge.type})`}
                    opacity={isHighlighted ? 0.8 : 0.2}
                  />
                  {/* Active edge animation */}
                  {edge.active && isHighlighted && (
                    <circle r="4" fill={color}>
                      <animateMotion
                        dur="2s"
                        repeatCount="indefinite"
                        path={`M${source.x},${source.y} L${target.x},${target.y}`}
                      />
                    </circle>
                  )}
                  {/* Edge label for trust relationships */}
                  {edge.label && isHighlighted && (
                    <text
                      x={(source.x + target.x) / 2}
                      y={(source.y + target.y) / 2 - 8}
                      textAnchor="middle"
                      fontSize="9"
                      fill={color}
                      fontWeight="600"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodes */}
            {layoutedNodes.map(renderNode)}
          </svg>

          {/* Legend overlay */}
          <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 p-3 shadow-sm">
            <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-2">Legend</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px]">
              {/* Node types */}
              {Object.entries(NODE_COLORS).map(([type, colors]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: colors.fill, border: `1px solid ${colors.stroke}` }} />
                  <span className="text-slate-600 capitalize">{type.replace('-', ' ')}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-slate-100 mt-2 pt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              {/* Edge types */}
              {Object.entries(EDGE_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5" style={{ backgroundColor: color }} />
                  <span className="text-slate-600 capitalize">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="w-72 border-l border-slate-200 bg-white overflow-y-auto">
          {selectedNodeData ? (
            <div className="p-4 space-y-4">
              {/* Node header */}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: NODE_COLORS[selectedNodeData.type].fill,
                    border: `2px solid ${NODE_COLORS[selectedNodeData.type].stroke}`,
                  }}
                >
                  <Icon name={NODE_ICONS[selectedNodeData.type]} className="w-5 h-5" style={{ color: NODE_COLORS[selectedNodeData.type].text }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 truncate">{selectedNodeData.label}</h3>
                  <p className="text-xs text-slate-500">{selectedNodeData.sublabel}</p>
                </div>
              </div>

              {/* Status & Risk */}
              <div className="flex gap-2">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded capitalize"
                  style={{
                    backgroundColor: `${STATUS_COLORS[selectedNodeData.status]}20`,
                    color: STATUS_COLORS[selectedNodeData.status],
                  }}
                >
                  {selectedNodeData.status}
                </span>
                {selectedNodeData.riskTier && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded capitalize"
                    style={{
                      backgroundColor: `${RISK_TIER_COLORS[selectedNodeData.riskTier]}20`,
                      color: RISK_TIER_COLORS[selectedNodeData.riskTier],
                    }}
                  >
                    {selectedNodeData.riskTier} risk
                  </span>
                )}
                {selectedNodeData.recentActivity && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700">
                    Active
                  </span>
                )}
              </div>

              {/* Metadata */}
              {selectedNodeData.metadata && (
                <div className="bg-slate-50 rounded-lg p-3">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Details</div>
                  <div className="space-y-1">
                    {Object.entries(selectedNodeData.metadata).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="font-medium text-slate-700">{typeof value === 'number' ? value.toLocaleString() : value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Connections */}
              {selectedNodeEdges.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Connections ({selectedNodeEdges.length})
                  </div>
                  <div className="space-y-1.5">
                    {selectedNodeEdges.map(edge => {
                      const isOutgoing = edge.source === selectedNode;
                      const otherNodeId = isOutgoing ? edge.target : edge.source;
                      const otherNode = layoutedNodes.find(n => n.id === otherNodeId);
                      if (!otherNode) return null;

                      return (
                        <div
                          key={edge.id}
                          {...rowButtonProps(() => setSelectedNode(otherNodeId), `Select ${otherNode.label}`)}
                          className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                        >
                          <Icon
                            name={isOutgoing ? 'arrow-right' : 'arrow-left'}
                            className="w-3.5 h-3.5 flex-shrink-0"
                            style={{ color: EDGE_COLORS[edge.type] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-slate-800 truncate">{otherNode.label}</div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span className="capitalize">{edge.type}</span>
                              {edge.label && <span className="text-slate-400">({edge.label})</span>}
                            </div>
                          </div>
                          <Icon name={NODE_ICONS[otherNode.type]} className="w-4 h-4 text-slate-400" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                onClick={() => setSelectedNode(null)}
                className="w-full py-2 text-xs text-slate-500 hover:text-slate-700 transition-colors"
              >
                Clear selection
              </button>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500 h-full flex flex-col items-center justify-center">
              <Icon name="cursor-arrow-rays" className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Select a node</p>
              <p className="text-xs text-slate-400 mt-1">Click any node to see its details and connections</p>
            </div>
          )}

          {/* Edge Type Legend */}
          <div className="border-t border-slate-200 p-4 bg-slate-50/50">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Edge Types</div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5" style={{ backgroundColor: EDGE_COLORS.invokes }} />
                <span className="text-slate-600">Invokes (user invokes agent)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5" style={{ backgroundColor: EDGE_COLORS.uses }} />
                <span className="text-slate-600">Uses (agent uses tool)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5 border-t-2 border-dashed" style={{ borderColor: EDGE_COLORS.trusts }} />
                <span className="text-slate-600">Trusts (A2A delegation)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5" style={{ backgroundColor: EDGE_COLORS.accesses }} />
                <span className="text-slate-600">Accesses (agent accesses data)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-0.5" style={{ backgroundColor: EDGE_COLORS.connects }} />
                <span className="text-slate-600">Connects (agent to MCP)</span>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="border-t border-slate-200 p-4 bg-white">
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Topology Stats</div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{layoutedNodes.filter(n => n.type === 'agent').length}</div>
                <div className="text-[10px] text-slate-500">Agents</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{layoutedNodes.filter(n => n.type === 'tool').length}</div>
                <div className="text-[10px] text-slate-500">Tools</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{filteredEdges.filter(e => e.type === 'trusts').length}</div>
                <div className="text-[10px] text-slate-500">A2A Links</div>
              </div>
              <div className="p-2 bg-slate-50 rounded-lg">
                <div className="text-lg font-bold text-slate-900">{layoutedNodes.filter(n => n.status === 'error').length}</div>
                <div className="text-[10px] text-slate-500">Errors</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
