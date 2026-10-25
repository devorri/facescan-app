import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeOff, GraduationCap, KeyRound, Lock, ShieldCheck, User, UserPlus } from 'lucide-react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { changePassword, createAccount, signOut, type AuthUser, type UserRole } from '../services/authService';

type ProfileScreenProps = {
  onSignedOut: () => void;
  adminUsername?: string;
  currentUser?: AuthUser;
};

export function ProfileScreen({ onSignedOut, adminUsername = 'admin', currentUser }: ProfileScreenProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Custodian Account Creation State
  const [newAccName, setNewAccName] = useState('');
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccRole, setNewAccRole] = useState<UserRole>('faculty');
  const [creatingAcc, setCreatingAcc] = useState(false);

  const isCustodian = currentUser?.role === 'custodian' || adminUsername.toLowerCase() === 'admin';

  const submitPassword = async () => {
    if (!currentPassword) {
      Alert.alert('Current password required', 'Please enter your current password.');
      return;
    }

    if (newPassword.length < 8) {
      Alert.alert('Weak password', 'New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords mismatch', 'New password and confirmation do not match.');
      return;
    }

    if (newPassword === currentPassword) {
      Alert.alert('Same password', 'New password cannot be the same as the current password.');
      return;
    }

    setSaving(true);
    try {
      await changePassword({
        username: adminUsername,
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Password has been updated successfully.');
    } catch (error) {
      Alert.alert('Unable to change password', getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccName.trim() || !newAccUsername.trim() || !newAccPassword.trim()) {
      Alert.alert('Missing fields', 'Please enter Name, Username, and Password.');
      return;
    }
    if (newAccPassword.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setCreatingAcc(true);
    try {
      await createAccount({
        fullName: newAccName.trim(),
        username: newAccUsername.trim(),
        password: newAccPassword,
        role: newAccRole,
      });

      Alert.alert(
        'Account Created! ✅',
        `Successfully registered @${newAccUsername.trim().toLowerCase()} as ${
          newAccRole === 'custodian' ? 'Laboratory Custodian' : 'Faculty Member'
        }.`
      );
      setNewAccName('');
      setNewAccUsername('');
      setNewAccPassword('');
      setNewAccRole('faculty');
    } catch (error: any) {
      const msg = error?.message || 'Unexpected error creating account';
      if (msg.includes('row-level security') || msg.includes('42501')) {
        Alert.alert(
          'Supabase Policy Notice',
          'Database policy requires insert permission on admins table.\n\nPlease execute in Supabase SQL Editor:\nCREATE POLICY "Allow anon insert on admins" ON public.admins FOR INSERT TO anon WITH CHECK (true);',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Account Creation Failed', msg);
      }
    } finally {
      setCreatingAcc(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      onSignedOut();
    } catch (error) {
      Alert.alert('Unable to logout', getErrorMessage(error));
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.heading}>Account & Access</Text>

      {/* ── User Profile Card ── */}
      <View style={[styles.card, Shadow.sm]}>
        <View style={[styles.avatarBubble, isCustodian ? styles.avatarCustodian : styles.avatarFaculty]}>
          {isCustodian ? (
            <ShieldCheck size={26} color={Colors.blue} strokeWidth={2.2} />
          ) : (
            <GraduationCap size={26} color="#D97706" strokeWidth={2.2} />
          )}
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.label}>Active Session</Text>
          <Text style={styles.email}>@{adminUsername}</Text>
          <View
            style={[
              styles.roleBadge,
              isCustodian ? styles.roleBadgeCustodian : styles.roleBadgeFaculty,
            ]}
          >
            {isCustodian ? (
              <ShieldCheck size={13} color="#1D4ED8" />
            ) : (
              <GraduationCap size={13} color="#B45309" />
            )}
            <Text
              style={[
                styles.roleBadgeText,
                isCustodian ? styles.roleTextCustodian : styles.roleTextFaculty,
              ]}
            >
              {isCustodian ? 'Laboratory Custodian (Admin)' : 'Faculty Member'}
            </Text>
          </View>
          <Text style={styles.privilegeSubtext}>
            {isCustodian
              ? 'Unrestricted 24/7 Force Unlock • Schedule Management • Account Creation'
              : 'Force Door Unlock active only during your scheduled class periods.'}
          </Text>
        </View>
      </View>

      {/* ── Custodian Only: Register New User Account ── */}
      {isCustodian && (
        <View style={[styles.form, Shadow.sm]}>
          <View style={styles.formHeader}>
            <UserPlus size={18} color={Colors.blue} strokeWidth={2.2} />
            <Text style={styles.formTitle}>Register User Account (Custodian Only)</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Create login credentials and set access level for faculty or new custodians.
          </Text>

          <FormField
            label="Full Name"
            placeholder="e.g. Engr. Maria Santos"
            value={newAccName}
            onChangeText={setNewAccName}
          />

          <FormField
            label="Login Username"
            placeholder="e.g. msantos"
            value={newAccUsername}
            onChangeText={setNewAccUsername}
            autoCapitalize="none"
          />

          <FormField
            label="Initial Password"
            placeholder="At least 6 characters"
            value={newAccPassword}
            onChangeText={setNewAccPassword}
            secureTextEntry
          />

          {/* Role selector */}
          <View style={styles.accessLevelWrapper}>
            <Text style={styles.accessLevelLabel}>Access Level</Text>
            <View style={styles.accessLevelRow}>
              <TouchableOpacity
                style={[
                  styles.accessLevelBtn,
                  newAccRole === 'faculty' && styles.accessLevelBtnActiveFaculty,
                ]}
                onPress={() => setNewAccRole('faculty')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.accessLevelText,
                    newAccRole === 'faculty' && styles.accessLevelTextActiveFaculty,
                  ]}
                >
                  🎓 Faculty
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.accessLevelBtn,
                  newAccRole === 'custodian' && styles.accessLevelBtnActiveCustodian,
                ]}
                onPress={() => setNewAccRole('custodian')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.accessLevelText,
                    newAccRole === 'custodian' && styles.accessLevelTextActiveCustodian,
                  ]}
                >
                  🛡️ Custodian
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.buttonWrapper}>
            <AppButton
              label="Create User Account"
              loading={creatingAcc}
              onPress={handleCreateAccount}
            />
          </View>
        </View>
      )}

      {/* ── Change Password Form ── */}
      <View style={[styles.form, Shadow.sm]}>
        <View style={styles.formHeader}>
          <KeyRound size={18} color={Colors.blue} strokeWidth={2.2} />
          <Text style={styles.formTitle}>Change Password</Text>
        </View>

        <View style={styles.inputWrap}>
          <FormField
            label="Current Password"
            onChangeText={setCurrentPassword}
            placeholder="Enter current password"
            secureTextEntry={!showCurrent}
            value={currentPassword}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowCurrent(!showCurrent)}
            activeOpacity={0.7}
          >
            {showCurrent ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrap}>
          <FormField
            label="New Password"
            onChangeText={setNewPassword}
            placeholder="At least 8 characters"
            secureTextEntry={!showNew}
            value={newPassword}
          />
          <TouchableOpacity
            style={styles.eyeBtn}
            onPress={() => setShowNew(!showNew)}
            activeOpacity={0.7}
          >
            {showNew ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <FormField
          label="Confirm New Password"
          onChangeText={setConfirmPassword}
          placeholder="Re-type new password"
          secureTextEntry={!showNew}
          value={confirmPassword}
        />

        <View style={styles.buttonWrapper}>
          <AppButton
            label="Update Password"
            loading={saving}
            onPress={submitPassword}
          />
        </View>
      </View>

      {/* ── Security Advice ── */}
      <View style={styles.securityBox}>
        <Lock size={16} color={Colors.textMuted} />
        <Text style={styles.securityText}>
          Use a strong passphrase with letters, numbers, and symbols to ensure laboratory access security.
        </Text>
      </View>

      {/* ── Logout Button ── */}
      <AppButton
        label="Logout Account"
        variant="danger"
        loading={loggingOut}
        onPress={logout}
      />
    </ScrollView>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#EBF5FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  email: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  roleBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
  },
  form: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  formTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  inputWrap: {
    position: 'relative',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 36,
    padding: 6,
  },
  buttonWrapper: {
    marginTop: 4,
  },
  securityBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(59, 163, 255, 0.06)',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.15)',
  },
  securityText: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },
  avatarCustodian: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  avatarFaculty: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  roleBadgeCustodian: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  roleBadgeFaculty: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  roleTextCustodian: {
    color: '#1D4ED8',
  },
  roleTextFaculty: {
    color: '#B45309',
  },
  privilegeSubtext: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  sectionSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginTop: -Spacing.xs,
  },
  accessLevelWrapper: {
    gap: 6,
  },
  accessLevelLabel: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  accessLevelRow: {
    flexDirection: 'row',
    gap: 10,
  },
  accessLevelBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessLevelBtnActiveFaculty: {
    backgroundColor: '#FFFBEB',
    borderColor: '#F59E0B',
  },
  accessLevelBtnActiveCustodian: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  accessLevelText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
  },
  accessLevelTextActiveFaculty: {
    color: '#B45309',
  },
  accessLevelTextActiveCustodian: {
    color: '#1D4ED8',
  },
});
