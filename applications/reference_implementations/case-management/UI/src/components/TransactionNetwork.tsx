import React, { useMemo, useRef, useState, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Box, Typography } from '@mui/material';

interface TransactionNetworkProps {
  transactions: any[];
}

const TransactionNetwork: React.FC<TransactionNetworkProps> = ({ transactions }) => {
  const graphRef = useRef<any>();
  const [graphWidth, setGraphWidth] = useState(window.innerWidth - 200);
  const [graphHeight, setGraphHeight] = useState(window.innerHeight - 80);

  useEffect(() => {
    const updateDimensions = () => {
      setGraphWidth(window.innerWidth - 200); // Account for sidebar
      setGraphHeight(window.innerHeight - 80); // Account for header
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const graphData = useMemo(() => {
    const nodes = new Set<any>();
    const links: any[] = [];
    const nodeCounts = new Map<string, number>();

    // Process transactions to create nodes and links
    transactions.forEach((transaction) => {
      const sourceId = transaction.accountId || transaction.src;
      const targetId = transaction.merchant || transaction.dst;
      
      // Count node occurrences for sizing
      nodeCounts.set(sourceId, (nodeCounts.get(sourceId) || 0) + 1);
      nodeCounts.set(targetId, (nodeCounts.get(targetId) || 0) + 1);
      
      // Add source node
      nodes.add({
        id: sourceId,
        type: 'source',
        label: sourceId,
        color: transaction.isFraud ? '#ff4444' : '#4CAF50',
        size: Math.min(12, 6 + nodeCounts.get(sourceId)! * 2),
        fraudScore: transaction.fraudScore,
        decision: transaction.decision,
        transactionCount: nodeCounts.get(sourceId)
      });

      // Add destination node
      nodes.add({
        id: targetId,
        type: 'destination',
        label: targetId,
        color: transaction.isFraud ? '#ff4444' : '#2196F3',
        size: Math.min(10, 4 + nodeCounts.get(targetId)! * 1.5),
        fraudScore: transaction.fraudScore,
        decision: transaction.decision,
        transactionCount: nodeCounts.get(targetId)
      });

      // Add link between source and destination
      links.push({
        source: sourceId,
        target: targetId,
        amount: transaction.amount,
        fraudScore: transaction.fraudScore,
        decision: transaction.decision,
        isFraud: transaction.isFraud,
        color: transaction.isFraud ? '#ff4444' : '#666',
        width: Math.min(8, Math.max(1, Math.sqrt(transaction.amount) / 50))
      });
    });

    return {
      nodes: Array.from(nodes) as any[],
      links: links
    };
  }, [transactions]);

  const handleNodeClick = (node: any) => {
    console.log('Node clicked:', node);
  };

  const handleLinkClick = (link: any) => {
    console.log('Link clicked:', link);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const totalNodes = graphData.nodes.length;
    const totalLinks = graphData.links.length;
    const fraudNodes = graphData.nodes.filter((n: any) => n.color === '#ff4444').length;
    const fraudLinks = graphData.links.filter((l: any) => l.isFraud).length;
    
    return {
      totalNodes,
      totalLinks,
      fraudNodes,
      fraudLinks,
      fraudPercentage: totalNodes > 0 ? ((fraudNodes / totalNodes) * 100).toFixed(1) : '0'
    };
  }, [graphData]);

  return (
    <Box sx={{ 
      width: '100%', 
      height: '100%', 
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Floating Statistics Panel */}
      <Box sx={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 1000,
        background: 'rgba(19, 25, 33, 0.95)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        minWidth: '200px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 153, 0, 0.3)'
      }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#FF9900' }}>
          Network Stats
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white' }}>
              {stats.totalNodes}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Nodes
            </Typography>
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'white' }}>
              {stats.totalLinks}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Links
            </Typography>
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#ff4444' }}>
              {stats.fraudNodes}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Fraud
            </Typography>
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#ff4444' }}>
              {stats.fraudPercentage}%
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Rate
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Floating Legend Panel */}
      <Box sx={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 1000,
        background: 'rgba(19, 25, 33, 0.95)',
        color: 'white',
        padding: '16px',
        borderRadius: '8px',
        minWidth: '180px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 153, 0, 0.3)'
      }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: '#FF9900' }}>
          Legend
        </Typography>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ color: '#FF9900' }}>
            Node Types:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: '#4CAF50', borderRadius: '50%', mr: 1 }} />
            <Typography variant="body2">Source</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: '#2196F3', borderRadius: '50%', mr: 1 }} />
            <Typography variant="body2">Destination</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 12, height: 12, bgcolor: '#ff4444', borderRadius: '50%', mr: 1 }} />
            <Typography variant="body2">Fraud</Typography>
          </Box>
        </Box>

        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ color: '#FF9900' }}>
            Connections:
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 20, height: 2, bgcolor: '#666', mr: 1 }} />
            <Typography variant="body2">Legitimate</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Box sx={{ width: 20, height: 2, bgcolor: '#ff4444', mr: 1 }} />
            <Typography variant="body2">Fraudulent</Typography>
          </Box>
        </Box>
      </Box>

      {/* Full Screen Network Visualization */}
      <Box sx={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0
      }}>
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeLabel={(node: any) => `
            ${node.label}
            Type: ${node.type}
            Transactions: ${node.transactionCount || 1}
            ${node.fraudScore ? `Fraud Score: ${(node.fraudScore * 100).toFixed(1)}%` : ''}
            ${node.decision ? `Decision: ${node.decision}` : ''}
          `}
          linkLabel={(link: any) => `
            Amount: $${link.amount?.toLocaleString()}
            Fraud Score: ${(link.fraudScore * 100).toFixed(1)}%
            Decision: ${link.decision}
            ${link.isFraud ? '🚨 FRAUD DETECTED' : '✅ Legitimate'}
          `}
          nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const label = node.label;
            const fontSize = Math.max(10, 14/globalScale);
            ctx.font = `bold ${fontSize}px "Amazon Ember", "Helvetica Neue", Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = node.color;
            ctx.fillText(label, node.x, node.y);
          }}
          linkWidth={(link: any) => link.width || 2}
          linkDirectionalArrowLength={8}
          linkDirectionalArrowRelPos={1}
          linkDirectionalArrowColor={(link: any) => link.color}
          onNodeClick={handleNodeClick}
          onLinkClick={handleLinkClick}
          cooldownTicks={200}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.4}
          nodeRelSize={8}
          backgroundColor="#f3f3f3"
          width={graphWidth}
          height={graphHeight}
        />
      </Box>
    </Box>
  );
};

export default TransactionNetwork;
