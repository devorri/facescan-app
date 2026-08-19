import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { changePassword, signOut } from '../services/authService';

type ProfileScreenProps = {
  onSignedOut: () => void;
  adminUsername?: string;
};

export function ProfileScreen({ onSignedOut, adminUsername = 'admin' }: ProfileScreenProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
      Alert.alert('Success', 'Admin password has been updated successfully.');
    } catch (error) {
      Alert.alert('Unable to change password', getErrorMessage(error));
    } finally {
      setSaving(false);
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
      <Text style={styles.heading}>Account Settings</Text>

      {/* ── Admin Info Card ── */}
      <View style={[styles.card, Shadow.sm]}>
        <View style={styles.avatarBubble}>
          <User size={24} color={Colors.blue} strokeWidth={2.2} />
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.email}>@{adminUsername}</Text>
          <View style={styles.roleBadge}>
            <ShieldCheck size={12} color={Colors.success} />
            <Text style={styles.roleBadgeText}>System Administrator</Text>
          </View>
        </View>
      </View>

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
});
