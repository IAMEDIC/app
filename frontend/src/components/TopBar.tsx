import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Avatar,
  IconButton,
  Menu,
  MenuItem,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  AccountCircle as AccountIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';

const TopBar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      logout();
      handleMenuClose();
    }
  };

  const handleNavigateHome = () => {
    navigate('/');
    handleMenuClose();
  };

  const isMenuOpen = Boolean(anchorEl);

  return (
    <AppBar position="sticky" sx={{ bgcolor: 'primary.main', mb: 2 }}>
      <Toolbar>
        {/* Logo and App Name */}
        <Box display="flex" alignItems="center" gap={2} sx={{ flexGrow: 1 }}>
          <img
            src="/logo.jpg"
            alt="IAMEDIC"
            style={{ width: 40, height: 40 }}
          />
          <Typography variant="h6" component="div" fontWeight="bold">
            IAMEDIC
          </Typography>
        </Box>

        {/* User Info and Menu */}
        {user && (
          <Box display="flex" alignItems="center" gap={2}>
            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
              Welcome, {user.name?.split(' ')[0]}
            </Typography>
            
            <IconButton
              size="large"
              edge="end"
              aria-label="account menu"
              aria-controls="account-menu"
              aria-haspopup="true"
              onClick={handleMenuOpen}
              color="inherit"
            >
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user.name?.charAt(0).toUpperCase()}
              </Avatar>
            </IconButton>

            <Menu
              id="account-menu"
              anchorEl={anchorEl}
              open={isMenuOpen}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              sx={{
                '& .MuiPaper-root': {
                  minWidth: 200,
                },
              }}
            >
              <MenuItem onClick={handleMenuClose} disabled>
                <Box>
                  <Typography variant="subtitle2">{user.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.email}
                  </Typography>
                </Box>
              </MenuItem>
              
              <MenuItem onClick={handleNavigateHome}>
                <AccountIcon sx={{ mr: 1 }} />
                Dashboard
              </MenuItem>
              
              <MenuItem onClick={handleLogout}>
                <LogoutIcon sx={{ mr: 1 }} />
                Logout
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;