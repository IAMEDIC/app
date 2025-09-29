import React, { useState } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
} from '@mui/material';
import {
  Language as LanguageIcon,
  Check as CheckIcon,
} from '@mui/icons-material';
import { useLanguage } from '@/contexts/LanguageContext';

const LanguageSelector: React.FC = () => {
  const { language, setLanguage, availableLanguages } = useLanguage();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLanguageChange = (langCode: 'en' | 'es') => {
    setLanguage(langCode);
    handleMenuClose();
  };

  const isMenuOpen = Boolean(anchorEl);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleMenuOpen}
        aria-label="language selector"
        aria-controls="language-menu"
        aria-haspopup="true"
        sx={{
          color: 'rgba(255, 255, 255, 0.8)',
          '&:hover': {
            color: 'rgba(255, 255, 255, 1)',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
          },
        }}
      >
        <LanguageIcon />
      </IconButton>

      <Menu
        id="language-menu"
        anchorEl={anchorEl}
        open={isMenuOpen}
        onClose={handleMenuClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        sx={{
          '& .MuiPaper-root': {
            minWidth: 160,
            mt: 1,
          },
        }}
      >
        <Box sx={{ px: 2, py: 1, borderBottom: '1px solid rgba(0,0,0,0.1)' }}>
          <Typography variant="caption" color="text.secondary">
            Language / Idioma
          </Typography>
        </Box>
        
        {availableLanguages.map((lang) => (
          <MenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            selected={language === lang.code}
            sx={{
              py: 1,
              '&.Mui-selected': {
                backgroundColor: 'rgba(25, 118, 210, 0.08)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              {language === lang.code && (
                <CheckIcon fontSize="small" color="primary" />
              )}
            </ListItemIcon>
            <ListItemText>
              <Box>
                <Typography variant="body2" fontWeight={language === lang.code ? 600 : 400}>
                  {lang.nativeName}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {lang.name}
                </Typography>
              </Box>
            </ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
};

export default LanguageSelector;