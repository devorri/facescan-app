import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MessageSquare,
  Search,
  ShieldCheck,
  User,
  X,
} from 'lucide-react-native';
import {
  findAccountForPasswordReset,
  getRemainingCooldown,
  requestPasswordResetOtp,
  verifyOtpAndResetPassword,
  type AccountLookupResult,
  type PasswordResetChannel,
} from '../services/authService';

type ForgotPasswordModalProps = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (identifier: string) => void;
};

export function ForgotPasswordModal({ visible, onClose, onSuccess }: ForgotPasswordModalProps) {
  // Step state: 1: Search, 2: Choose Method, 3: Enter OTP & New Password, 4: Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [account, setAccount] = useState<AccountLookupResult | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<PasswordResetChannel>('email');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Cooldown timer state (in seconds)
  const [cooldown, setCooldown] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Loading & status states
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<string | null>(null);

  // Reset modal state when opened or closed
  useEffect(() => {
    if (visible) {
      setStep(1);
      setIdentifier('');
      setAccount(null);
      setSelectedChannel('email');
      setOtpCode('');
      setNewPassword('');
      setConfirmPassword('');
      setErrorMessage(null);
      setSuccessInfo(null);
      setCooldown(0);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [visible]);

  // Start cooldown timer
  const startCooldownTimer = (seconds: number) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    setCooldown(seconds);

    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  // Format cooldown seconds to "MM:SS"
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Step 1: Find Account
  const handleSearchAccount = async () => {
    if (!identifier.trim()) {
      setErrorMessage('Please enter your username, email, or mobile number.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await findAccountForPasswordReset(identifier);
      setAccount(res);

      // Default selection to what is available
      if (res.hasEmail) {
        setSelectedChannel('email');
      } else if (res.hasPhone) {
        setSelectedChannel('sms');
      }

      setStep(2);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No matching account found.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Send OTP
  const handleSendOtp = async (isResend: boolean = false) => {
    if (!account) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await requestPasswordResetOtp(account.profileId, selectedChannel);
      startCooldownTimer(res.cooldownSeconds || 60);
      setSuccessInfo(
        `Code sent to ${res.destinationMasked} via ${res.channel === 'sms' ? 'SMS' : 'Email'}.`
      );
      if (!isResend) {
        setStep(3);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify OTP & Reset Password
  const handleResetPassword = async () => {
    if (!account) return;

    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      await verifyOtpAndResetPassword(account.profileId, otpCode, newPassword);
      setStep(4);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    onClose();
    if (onSuccess && account) {
      onSuccess(account.email || account.name);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalCard}>
          {/* ── Top Header ── */}
          <View style={styles.modalHeader}>
            <View style={styles.headerLeft}>
              {step > 1 && step < 4 && (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={() => {
                    setErrorMessage(null);
                    setStep((prev) => (prev - 1) as any);
                  }}
                  activeOpacity={0.7}
                >
                  <ArrowLeft size={18} color="#0F172A" />
                </TouchableOpacity>
              )}
              <Text style={styles.modalTitle}>
                {step === 4 ? 'Success' : 'Reset Password'}
              </Text>
            </View>

            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── Error Banner ── */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* ── STEP 1: Search Account ── */}
            {step === 1 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepHeading}>Find Your Account</Text>
                <Text style={styles.stepSubheading}>
                  Enter your registered username, instructor email, or 11-digit mobile number.
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Username, Email, or Mobile</Text>
                  <View style={styles.inputWrapper}>
                    <Search size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="e.g. juan@gmail.com or 09171234567"
                      placeholderTextColor="#94A3B8"
                      value={identifier}
                      onChangeText={(val) => {
                        setIdentifier(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleSearchAccount}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Search Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 2: Choose Delivery Method ── */}
            {step === 2 && account && (
              <View style={styles.stepContainer}>
                <View style={styles.accountCard}>
                  <View style={styles.accountAvatar}>
                    <User size={20} color="#2563EB" />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName}>{account.name}</Text>
                    <Text style={styles.accountSub}>Account verified</Text>
                  </View>
                </View>

                <Text style={styles.stepHeading}>Choose OTP Destination</Text>
                <Text style={styles.stepSubheading}>
                  Select where you want to receive your 6-digit one-time password:
                </Text>

                {/* Option: Email */}
                <TouchableOpacity
                  style={[
                    styles.channelCard,
                    selectedChannel === 'email' && styles.channelCardSelected,
                    !account.hasEmail && styles.channelCardDisabled,
                  ]}
                  onPress={() => {
                    if (account.hasEmail) setSelectedChannel('email');
                  }}
                  disabled={!account.hasEmail}
                  activeOpacity={0.7}
                >
                  <View style={[styles.channelIconBox, selectedChannel === 'email' && styles.channelIconBoxSelected]}>
                    <Mail size={20} color={selectedChannel === 'email' ? '#2563EB' : '#64748B'} />
                  </View>
                  <View style={styles.channelTextCol}>
                    <Text style={styles.channelTitle}>Email (Gmail)</Text>
                    <Text style={styles.channelDetail}>
                      {account.hasEmail ? account.maskedEmail : 'Not configured'}
                    </Text>
                  </View>
                  <View style={[styles.radioCircle, selectedChannel === 'email' && styles.radioCircleSelected]}>
                    {selectedChannel === 'email' && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>

                {/* Option: Mobile SMS */}
                <TouchableOpacity
                  style={[
                    styles.channelCard,
                    selectedChannel === 'sms' && styles.channelCardSelected,
                    !account.hasPhone && styles.channelCardDisabled,
                  ]}
                  onPress={() => {
                    if (account.hasPhone) setSelectedChannel('sms');
                  }}
                  disabled={!account.hasPhone}
                  activeOpacity={0.7}
                >
                  <View style={[styles.channelIconBox, selectedChannel === 'sms' && styles.channelIconBoxSelected]}>
                    <MessageSquare size={20} color={selectedChannel === 'sms' ? '#2563EB' : '#64748B'} />
                  </View>
                  <View style={styles.channelTextCol}>
                    <Text style={styles.channelTitle}>Mobile SMS (Semaphore)</Text>
                    <Text style={styles.channelDetail}>
                      {account.hasPhone ? account.maskedPhone : 'Not configured'}
                    </Text>
                  </View>
                  <View style={[styles.radioCircle, selectedChannel === 'sms' && styles.radioCircleSelected]}>
                    {selectedChannel === 'sms' && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={() => handleSendOtp(false)}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send 6-Digit OTP</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 3: Enter OTP & Set New Password ── */}
            {step === 3 && account && (
              <View style={styles.stepContainer}>
                {successInfo ? (
                  <View style={styles.infoBox}>
                    <Text style={styles.infoText}>{successInfo}</Text>
                  </View>
                ) : null}

                <Text style={styles.stepHeading}>Enter Verification Code</Text>
                <Text style={styles.stepSubheading}>
                  Enter the 6-digit code sent to your {selectedChannel === 'sms' ? 'mobile number' : 'email'}.
                </Text>

                {/* 6-Digit Code Input */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>6-Digit OTP Code</Text>
                  <TextInput
                    style={styles.otpInput}
                    placeholder="••••••"
                    placeholderTextColor="#CBD5E1"
                    keyboardType="number-pad"
                    maxLength={6}
                    value={otpCode}
                    onChangeText={(val) => {
                      setOtpCode(val.replace(/\D/g, ''));
                      if (errorMessage) setErrorMessage(null);
                    }}
                    autoFocus
                  />
                </View>

                {/* Cooldown Timer & Resend */}
                <View style={styles.cooldownRow}>
                  {cooldown > 0 ? (
                    <View style={styles.cooldownBadge}>
                      <Clock size={14} color="#64748B" />
                      <Text style={styles.cooldownText}>
                        Resend available in{' '}
                        <Text style={styles.cooldownBold}>{formatTime(cooldown)}</Text>
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleSendOtp(true)}
                      disabled={loading}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.resendLink}>
                        Didn't receive the code?{' '}
                        <Text style={styles.resendLinkBold}>Resend OTP</Text>
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* New Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>New Password</Text>
                  <View style={styles.inputWrapper}>
                    <KeyRound size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="At least 6 characters"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showNewPassword}
                      value={newPassword}
                      onChangeText={(val) => {
                        setNewPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      {showNewPassword ? (
                        <EyeOff size={18} color="#94A3B8" />
                      ) : (
                        <Eye size={18} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Confirm Password */}
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Confirm New Password</Text>
                  <View style={styles.inputWrapper}>
                    <ShieldCheck size={18} color="#94A3B8" style={styles.inputIcon} />
                    <TextInput
                      style={styles.textInput}
                      placeholder="Re-enter new password"
                      placeholderTextColor="#94A3B8"
                      secureTextEntry={!showConfirmPassword}
                      value={confirmPassword}
                      onChangeText={(val) => {
                        setConfirmPassword(val);
                        if (errorMessage) setErrorMessage(null);
                      }}
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                      style={styles.eyeBtn}
                      activeOpacity={0.7}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} color="#94A3B8" />
                      ) : (
                        <Eye size={18} color="#94A3B8" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Reset Password</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* ── STEP 4: Success ── */}
            {step === 4 && (
              <View style={[styles.stepContainer, styles.successCenter]}>
                <View style={styles.successIconCircle}>
                  <CheckCircle2 size={44} color="#16A34A" />
                </View>
                <Text style={styles.successTitle}>Password Reset Complete</Text>
                <Text style={styles.successSub}>
                  Your password has been securely updated. You can now log in using your new credentials.
                </Text>

                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleFinish}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>Back to Sign In</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const FONT_FAMILY = Platform.select({
  ios: 'Arial',
  android: 'sans-serif',
  default: 'Arial, sans-serif',
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    padding: 4,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  stepContainer: {
    gap: 16,
  },
  stepHeading: {
    fontFamily: FONT_FAMILY,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  stepSubheading: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: -8,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    height: 46,
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    color: '#0F172A',
  },
  eyeBtn: {
    padding: 6,
  },
  otpInput: {
    height: 52,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    textAlign: 'center',
    fontFamily: FONT_FAMILY,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 10,
    color: '#0F172A',
  },
  cooldownRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  cooldownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cooldownText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
  },
  cooldownBold: {
    fontWeight: '700',
    color: '#0F172A',
  },
  resendLink: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
  },
  resendLinkBold: {
    fontWeight: '700',
    color: '#2563EB',
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
  },
  accountAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontFamily: FONT_FAMILY,
    fontSize: 15,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  accountSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#3B82F6',
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  channelCardSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#F8FAFC',
  },
  channelCardDisabled: {
    opacity: 0.5,
    backgroundColor: '#F8FAFC',
  },
  channelIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelIconBoxSelected: {
    backgroundColor: '#EFF6FF',
  },
  channelTextCol: {
    flex: 1,
    gap: 2,
  },
  channelTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  channelDetail: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#64748B',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: {
    borderColor: '#2563EB',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#2563EB',
  },
  primaryButton: {
    height: 46,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#F87171',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '600',
  },
  infoBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    padding: 10,
  },
  infoText: {
    fontFamily: FONT_FAMILY,
    fontSize: 12,
    color: '#16A34A',
    fontWeight: '600',
  },
  successCenter: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  successIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successTitle: {
    fontFamily: FONT_FAMILY,
    fontSize: 19,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  successSub: {
    fontFamily: FONT_FAMILY,
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
});

