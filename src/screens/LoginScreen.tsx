import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Alert,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, Lock, Scan, ShieldCheck, Sparkles, User } from 'lucide-react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { AdminUser, signIn } from '../services/authService';

type LoginScreenProps = {
  onSignedIn: (admin: AdminUser) => void;
};

export function LoginScreen({ onSignedIn }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing login', 'Enter username and password.');
      return;
    }

    setLoading(true);
    try {
      const admin = await signIn(username, password);
      onSignedIn(admin);
    } catch (error) {
      Alert.alert('Login failed', getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/images/bg-facescan.png')}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <View style={styles.darkOverlay} />
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Dual Logo Brand Header ── */}
            <View style={styles.brandHeader}>
              <View style={styles.logosRow}>
                <View style={styles.logoBadge}>
                  <Image
                    source={require('@/assets/images/logo.png')}
                    style={styles.mainLogo}
                    resizeMode="contain"
                  />
                </View>
                <View style={styles.logoDivider} />
                <View style={styles.logoBadge}>
                  <Image
                    source={require('@/assets/images/pampanga-logo.png')}
                    style={styles.pampangaLogo}
                    resizeMode="contain"
                  />
                </View>
              </View>

              <View style={styles.badgePill}>
                <Sparkles size={12} color={Colors.blueLight} />
                <Text style={styles.badgePillText}>FACIAL RECOGNITION SYSTEM</Text>
              </View>

              <Text style={styles.title}>CCS Smartlab Access</Text>
              <Text style={styles.subtitle}>Provincial Laboratory Security</Text>
            </View>

            {/* ── Sign In Card ── */}
            <View style={[styles.panel, Shadow.lg]}>
              <View style={styles.panelHeader}>
                <View style={styles.iconCircle}>
                  <Scan size={20} color={Colors.blueLight} strokeWidth={2.2} />
                </View>
                <View>
                  <Text style={styles.panelTitle}>Administrator Portal</Text>
                  <Text style={styles.panelSubtitle}>Sign in with authorized credentials</Text>
                </View>
              </View>

              <View style={styles.formContainer}>
                <FormField
                  autoCapitalize="none"
                  label="Username"
                  onChangeText={setUsername}
                  placeholder="admin"
                  value={username}
                />

                <View style={styles.passwordWrapper}>
                  <FormField
                    label="Password"
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={password}
                  />
                  <TouchableOpacity
                    style={styles.eyeToggle}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.7}
                  >
                    {showPassword ? (
                      <EyeOff size={18} color={Colors.textMuted} />
                    ) : (
                      <Eye size={18} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.buttonWrapper}>
                  <AppButton label="Sign In to Console" loading={loading} onPress={submit} />
                </View>
              </View>

              <View style={styles.footerNote}>
                <ShieldCheck size={14} color="rgba(16, 185, 129, 0.9)" />
                <Text style={styles.footerNoteText}>
                  Protected by 128-d Biometric Verification & Supabase
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#050B18',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 11, 24, 0.88)',
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.xl,
    paddingVertical: Spacing.xxl,
    gap: Spacing.lg,
  },
  brandHeader: {
    alignItems: 'center',
    gap: 8,
  },
  logosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 4,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1.5,
    borderColor: 'rgba(59, 163, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    ...Shadow.md,
  },
  mainLogo: {
    width: '100%',
    height: '100%',
  },
  pampangaLogo: {
    width: '100%',
    height: '100%',
  },
  logoDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 163, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.25)',
    marginTop: 4,
  },
  badgePillText: {
    color: Colors.blueLight,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: Colors.textWhite,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  panel: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderRadius: Radius.xl,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.2)',
    gap: Spacing.lg,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 163, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTitle: {
    color: Colors.textWhite,
    fontSize: 17,
    fontWeight: '800',
  },
  panelSubtitle: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  formContainer: {
    gap: Spacing.md,
  },
  passwordWrapper: {
    position: 'relative',
  },
  eyeToggle: {
    position: 'absolute',
    right: 12,
    top: 36,
    padding: 6,
  },
  buttonWrapper: {
    marginTop: Spacing.xs,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: Spacing.xs,
  },
  footerNoteText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
});
