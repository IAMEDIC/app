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
} from '@mui/material';
import { User, DoctorProfile, DoctorProfileApproval } from '@/types';
import api from '@/services/api';

interface AdminDashboardProps {}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
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
      setError(err.response?.data?.detail || 'Failed to load admin data');
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
      setError(err.response?.data?.detail || 'Failed to update registration');
    }
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
        Admin Dashboard
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Pending Doctor Registrations */}
      <Paper sx={{ mb: 4 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Pending Doctor Registrations ({pendingRegistrations.length})
          </Typography>
          
          {pendingRegistrations.length === 0 ? (
            <Typography color="text.secondary">
              No pending registrations
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Legal Name</TableCell>
                    <TableCell>Email</TableCell>
                    <TableCell>Matriculation ID</TableCell>
                    <TableCell>Specialization</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Actions</TableCell>
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
                          Approve
                        </Button>
                        <Button
                          variant="contained"
                          color="error"
                          size="small"
                          onClick={() => handleApprovalAction(profile, 'denied')}
                        >
                          Deny
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
            All Users ({users.length})
          </Typography>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Roles</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Created</TableCell>
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
                        label="Active" 
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

      {/* Approval Dialog */}
      <Dialog open={approvalDialog} onClose={() => setApprovalDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedProfile ? 
            `Review Registration: ${selectedProfile.legalName}` : 
            'Review Registration'
          }
        </DialogTitle>
        <DialogContent>
          {selectedProfile && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Matriculation ID:</strong> {selectedProfile.matriculationId}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Specialization:</strong> {selectedProfile.specialization}
              </Typography>
            </Box>
          )}
          
          <TextField
            label="Notes (optional)"
            value={approvalNotes}
            onChange={(e) => setApprovalNotes(e.target.value)}
            multiline
            rows={3}
            fullWidth
            placeholder="Add any notes about the approval/denial decision..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setApprovalDialog(false)}>Cancel</Button>
          <Button 
            onClick={() => submitApproval('denied')} 
            color="error"
            variant="contained"
          >
            Deny
          </Button>
          <Button 
            onClick={() => submitApproval('approved')} 
            color="success"
            variant="contained"
          >
            Approve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};