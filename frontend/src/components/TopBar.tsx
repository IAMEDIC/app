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
  Divider,
} from '@mui/material';
import {
  Logout as LogoutIcon,
  AccountCircle as AccountIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';
import { useStorageInfo } from '@/contexts/StorageContext';
import { TopBarStorageIndicator } from '@/components/TopBarStorageIndicator';
import LanguageSelector from '@/components/LanguageSelector';
import { useTranslation } from '@/contexts/LanguageContext';

const TopBar: React.FC = () => {
  const { user, logout } = useAuthStore();
  const { storageInfo } = useStorageInfo();
  const { t } = useTranslation();
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
        <Box display="flex" alignItems="center" gap={2}>
          <img
            src="/logo.jpg"
            alt="IAMEDIC"
            style={{ width: 40, height: 40 }}
          />
          <Typography variant="h6" component="div" fontWeight="bold">
            IAMEDIC
          </Typography>
        </Box>

        {/* Center spacer */}
        <Box sx={{ flexGrow: 1 }} />

        {/* Storage Indicator, Language Selector and User Info */}
        {user && (
          <Box display="flex" alignItems="center" gap={2}>
            {/* Storage Indicator - only for doctors */}
            {user.roles?.includes('doctor') && storageInfo && (
              <>
                <TopBarStorageIndicator storageInfo={storageInfo} />
                <Divider 
                  orientation="vertical" 
                  flexItem 
                  sx={{ 
                    bgcolor: 'rgba(255, 255, 255, 0.3)', 
                    height: 24,
                    alignSelf: 'center'
                  }} 
                />
              </>
            )}

            {/* Language Selector */}
            <LanguageSelector />
            <Divider 
              orientation="vertical" 
              flexItem 
              sx={{ 
                bgcolor: 'rgba(255, 255, 255, 0.3)', 
                height: 24,
                alignSelf: 'center'
              }} 
            />

            <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
              {t('user.welcome')}, {user.name?.split(' ')[0]}
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
          </Box>
        )}

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
              <Typography variant="subtitle2">{user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.email}
              </Typography>
            </Box>
          </MenuItem>
          
          <MenuItem onClick={handleNavigateHome}>
            <AccountIcon sx={{ mr: 1 }} />
            {t('navigation.dashboard')}
          </MenuItem>
          
          <MenuItem onClick={handleLogout}>
            <LogoutIcon sx={{ mr: 1 }} />
            {t('auth.logout')}
          </MenuItem>
        </Menu>
      </Toolbar>
    </AppBar>
  );
};

export default TopBar;