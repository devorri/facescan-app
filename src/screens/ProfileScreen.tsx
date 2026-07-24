import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { changePassword, signOut } from '../services/authService';

type ProfileScreenProps = {
  onSignedOut: () => void;
};

export function ProfileScreen({ onSignedOut }: ProfileScreenProps) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const submitPassword = async () => {
    if (password.length < 8) {
      Alert.alert('Weak password', 'Use at least 8 characters.');
      return;
    }

    setSaving(true);
    try {
      await changePassword(password, 'admin');
      setPassword('');
      Alert.alert('Password changed', 'Your password has been updated.');
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Account settings</Text>
      
      <View style={[styles.card, Shadow.sm]}>
        <View style={styles.avatarBubble}>
          <Text style={styles.avatarText}>🔑</Text>
        </View>
        <View>
          <Text style={styles.label}>Signed in as</Text>
          <Text style={styles.email}>admin</Text>
        </View>
      </View>

      <View style={styles.form}>
        <Text style={styles.formTitle}>Change Password</Text>
        <FormField
          label="New Password"
          onChangeText={setPassword}
          placeholder="At least 8 characters"
          secureTextEntry
          value={password}
        />
        <AppButton label="Update Password" loading={saving} onPress={submitPassword} />
      </View>

      <AppButton label="Logout Account" variant="danger" loading={loggingOut} onPress={logout} />
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
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  email: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  form: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  formTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
});
