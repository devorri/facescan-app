import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { signIn } from '../services/authService';

type LoginScreenProps = {
  onSignedIn: () => void;
};

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing login', 'Enter username and password.');
      return;
    }

    setLoading(true);
    try {
      await signIn(username, password);
      onSignedIn();
    } catch (error) {
      Alert.alert('Login failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <View style={[styles.panel, Shadow.md]}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Lab Access Admin</Text>
          <Text style={styles.subtitle}>Administrator Sign In</Text>
          
          <View style={styles.formContainer}>
            <FormField
              autoCapitalize="none"
              keyboardType="email-address"
              label="Username / Email"
              onChangeText={setUsername}
              placeholder="admin"
              value={username}
            />
            <FormField
              label="Password"
              onChangeText={setPassword}
              placeholder="Enter password"
              secureTextEntry
              value={password}
            />
            <View style={styles.buttonWrapper}>
              <AppButton label="Sign In" loading={loading} onPress={submit} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.navyDark,
  },
  container: {
    backgroundColor: Colors.navyDark,
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  panel: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.navyLight,
  },
  logo: {
    width: 100,
    height: 100,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.lg,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  formContainer: {
    gap: Spacing.md,
  },
  buttonWrapper: {
    marginTop: Spacing.xs,
  },
});
