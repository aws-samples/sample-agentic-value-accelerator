import React from 'react';
import {
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Box,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  Receipt as TransactionsIcon,
  AccountTree as NetworkIcon,
  Chat as ChatIcon,
  PlayArrow as SimulateIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const drawerWidth = 200;

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      text: 'Dashboard',
      icon: <DashboardIcon />,
      path: '/',
    },
    {
      text: 'Transactions',
      icon: <TransactionsIcon />,
      path: '/transactions',
    },
    {
      text: 'Transactions Network Analysis',
      icon: <NetworkIcon />,
      path: '/network',
    },
    {
      text: 'AI Assistant',
      icon: <ChatIcon />,
      path: '/chat',
    },
    {
      text: 'Simulate Transactions',
      icon: <SimulateIcon />,
      path: '/simulate',
    },
  ];

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
      <Box
        sx={{
          width: drawerWidth,
          position: 'fixed',
          top: '80px',
          left: 0,
          height: 'calc(100vh - 80px)',
          background: 'linear-gradient(180deg, #232F3E 0%, #131921 100%)',
          color: 'white',
          borderRight: '3px solid #FF9900',
          zIndex: 1100,
          overflow: 'hidden',
          boxSizing: 'border-box',
          fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
        }}
      >
      <List sx={{ px: 1, pt: 2 }}>
        {menuItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 3,
                  backgroundColor: isActive ? '#FF9900' : 'transparent',
                  '&:hover': {
                    backgroundColor: isActive ? '#FFB84D' : 'rgba(255, 153, 0, 0.15)',
                  },
                  transition: 'all 0.2s ease',
                  borderLeft: isActive ? '4px solid #FF9900' : '4px solid transparent',
                  padding: '8px 12px',
                }}
              >
                <ListItemIcon sx={{ color: isActive ? '#131921' : 'white', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText 
                  primary={item.text}
                  sx={{
                    '& .MuiListItemText-primary': {
                      color: isActive ? '#131921' : 'white',
                      fontWeight: isActive ? '600' : '400',
                      fontSize: '0.9rem',
                      fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                    },
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
};

export default Sidebar;
