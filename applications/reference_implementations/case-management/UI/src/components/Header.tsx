import React from 'react';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

interface HeaderProps {
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
}

const Header: React.FC<HeaderProps> = ({ title, subtitle, onRefresh }) => {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '80px',
        backgroundColor: '#131921',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '3px solid #FF9900',
        zIndex: 1200,
        fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      {/* AWS Logo */}
      <Box sx={{ 
        display: 'flex', 
        alignItems: 'center',
        minWidth: '200px'
      }}>
        <a 
          href="https://aws.amazon.com/what-is-cloud-computing" 
          target="_blank" 
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
        >
          <img 
            src="https://d0.awsstatic.com/logos/powered-by-aws-white.png" 
            alt="Powered by AWS Cloud Computing"
            style={{ 
              height: '40px',
              width: 'auto'
            }}
          />
        </a>
      </Box>

      <Box sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center',
        flex: 1,
        textAlign: 'center'
      }}>
        <Typography
          variant="h5"
          sx={{
            fontWeight: 600,
            color: 'white',
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            sx={{
              color: '#FF9900',
              margin: 0,
              marginTop: '2px',
              opacity: 0.9,
            }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      
      {onRefresh && (
        <Tooltip title="Refresh Data">
          <IconButton
            onClick={onRefresh}
            sx={{
              color: 'white',
              backgroundColor: 'rgba(255, 153, 0, 0.1)',
              '&:hover': {
                backgroundColor: 'rgba(255, 153, 0, 0.2)',
              },
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
};

export default Header;
