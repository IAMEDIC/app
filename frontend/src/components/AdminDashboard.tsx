import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Alert,
  CircularProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
} from '@mui/material';
import { User, DoctorProfile, DoctorProfileApproval } from '@/types';
import { ModelStatisticsTab } from '@/components/ModelStatisticsTab';
import { DataExportTab } from '@/components/DataExportTab';
import { FileManagementTab } from '@/components/FileManagementTab';
import { useTranslation } from '@/contexts/LanguageContext';
import api from '@/services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

interface AdminDashboardProps {}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [pendingRegistrations, setPendingRegistrations] = useState<DoctorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<DoctorProfile | null>(null);
  const [approvalDialog, setApprovalDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [usersResponse, registrationsResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/doctor-registrations?status_filter=pending'),
      ]);
      
      setUsers(usersResponse.data);
      setPendingRegistrations(registrationsResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.errors.failedToLoadData'));
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalAction = (profile: DoctorProfile, _action: 'approved' | 'denied') => {
    setSelectedProfile(profile);
    setApprovalDialog(true);
  };

  const submitApproval = async (action: 'approved' | 'denied') => {
    if (!selectedProfile) return;

    try {
      const approvalData: DoctorProfileApproval = {
        status: action,
        notes: approvalNotes || undefined,
      };

      await api.put(`/admin/doctor-registrations/${selectedProfile.id}/approve`, approvalData);
      
      // Reload data to reflect changes
      await loadData();
      
      // Close dialog and reset state
      setApprovalDialog(false);
      setSelectedProfile(null);
      setApprovalNotes('');
    } catch (err: any) {
      setError(err.response?.data?.detail || t('admin.errors.failedToUpdateRegistration'));
    }
  };

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setCurrentTab(newValue);
  };

  const getRoleChips = (roles: string[] = []) => {
    return roles.map((role) => (
      <Chip
        key={role}
        label={role.toUpperCase()}
        color={role === 'admin' ? 'error' : 'primary'}
        size="small"
        sx={{ mr: 0.5 }}
      />
    ));
  };

  const getStatusChip = (status: string) => {
    const color = status === 'pending' ? 'warning' : 
                  status === 'approved' ? 'success' : 'error';
    return <Chip label={status.toUpperCase()} color={color} size="small" />;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('admin.dashboard')}
      </Typography>

      {/* Main Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs 
          value={currentTab} 
          onChange={handleTabChange}
          aria-label="Admin dashboard tabs"
        >
          <Tab 
            label={t('admin.tabs.userManagement')} 
            id="admin-tab-0"
            aria-controls="admin-tabpanel-0"
          />
          <Tab 
            label={t('admin.tabs.filesManagement')}
            id="admin-tab-1"
            aria-controls="admin-tabpanel-1" 
          />
          <Tab 
            label={t('admin.tabs.modelStatistics')}
            id="admin-tab-2"
            aria-controls="admin-tabpanel-2" 
          />
          <Tab 
            label={t('admin.tabs.dataExport')}
            id="admin-tab-3"
            aria-controls="admin-tabpanel-3" 
          />
        </Tabs>
      </Box>

      {/* User Management Tab */}
      <TabPanel value={currentTab} index={0}>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Pending Doctor Registrations */}
        <Paper sx={{ mb: 4 }}>
          <Box sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              {t('admin.userManagement.pendingRegistrations')} ({pendingRegistrations.length})
            </Typography>
            
            {pendingRegistrations.length === 0 ? (
              <Typography color="text.secondary">
                {t('admin.userManagement.noPendingRegistrations')}
              </Typography>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('admin.userManagement.legalName')}</TableCell>
                      <TableCell>{t('admin.userManagement.email')}</TableCell>
                      <TableCell>{t('admin.userManagement.matriculationId')}</TableCell>
                      <TableCell>{t('admin.userManagement.specialization')}</TableCell>
                      <TableCell>{t('admin.userManagement.status')}</TableCell>
                      <TableCell>{t('admin.userManagement.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingRegistrations.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell>{profile.legalName}</TableCell>
                      <TableCell>
                        {users.find(u => u.id === profile.userId)?.email || 'Unknown'}
                      </TableCell>
                      <TableCell>{profile.matriculationId}</TableCell>
                      <TableCell>{profile.specialization}</TableCell>
                      <TableCell>{getStatusChip(profile.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="contained"
                          color="success"
                          size="small"
                          onClick={() => handleApprovalAction(profile, 'approved')}
                          sx={{ mr: 1 }}
                        >
                          {t('admin.userManagement.approve')}
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          onClick={() => handleApprovalAction(profile, 'denied')}
                        >
                          {t('admin.userManagement.deny')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Paper>

      {/* All Users */}
      <Paper>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('admin.userManagement.allUsers')} ({users.length})
          </Typography>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>{t('admin.userManagement.email')}</TableCell>
                  <TableCell>{t('admin.userManagement.roles')}</TableCell>
                  <TableCell>{t('admin.userManagement.status')}</TableCell>
                  <TableCell>{t('admin.userManagement.created')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{getRoleChips(user.roles)}</TableCell>
                    <TableCell>
                      <Chip 
                        label={t('admin.userManagement.active')} 
                        color="success" 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>
                      {new Date(user.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>
      </TabPanel>

      {/* Files Management Tab */}
      <TabPanel value={currentTab} index={1}>
        <FileManagementTab />
      </TabPanel>

      {/* Model Statistics Tab */}
      <TabPanel value={currentTab} index={2}>
        <ModelStatisticsTab />
      </TabPanel>

      {/* Data Export Tab */}
      <TabPanel value={currentTab} index={3}>
        <DataExportTab />
      </TabPanel>

      {/* Approval Dialog - Outside tabs so it can be shown from any tab */}
      <Dialog open={approvalDialog} onClose={() => setApprovalDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedProfile ? 
            t('admin.userManagement.approvalDialog.title', { name: selectedProfile.legalName }) : 
            t('admin.userManagement.reviewRegistration')
          }
        </DialogTitle>
        <DialogContent>
          {selectedProfile && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>{t('admin.userManagement.approvalDialog.matriculationLabel')}</strong> {selectedProfile.matriculationId}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>{t('admin.userManagement.approvalDialog.specializationLabel')}</strong> {selectedProfile.specialization}
              </Typography>
            </Box>
          )}
          
          <TextField
            label={t('admin.userManagement.notes')}
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
            placeholder={t('admin.userManagement.notesPlaceholder')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalDialog(false)}>{t('admin.userManagement.approvalDialog.cancel')}</Button>
          <Button 
            onClick={() => submitApproval('denied')} 
            color="error"
            variant="contained"
          >
            {t('admin.userManagement.approvalDialog.deny')}
          </Button>
          <Button 
            onClick={() => submitApproval('approved')} 
            color="success"
            variant="contained"
          >
            {t('admin.userManagement.approvalDialog.approve')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};