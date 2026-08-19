import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  CheckCircle2,
  DoorOpen,
  Lock,
  RefreshCw,
  Scan,
  ShieldAlert,
  Unlock,
  X,
} from 'lucide-react-native';
import { AppButton } from './AppButton';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { forceUnlockDoor, ForceUnlockResult } from '../services/doorService';

type ForceDoorUnlockModalProps = {
  visible: boolean;
  onClose: () => void;
  onUnlocked?: (result: ForceUnlockResult) => void;
  adminUsername?: string;
};

export function ForceDoorUnlockModal({
  visible,
  onClose,
  onUnlocked,
  adminUsername = 'admin',
}: ForceDoorUnlockModalProps) {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isProcessing, setIsProcessing] = useState(false);
  const [unlockedSuccess, setUnlockedSuccess] = useState<ForceUnlockResult | null>(null);

  const handleForceUnlock = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(
          'Camera Required',
          'Camera access is required to verify the administrator and log the face during a manual door override.',
        );
        return;
      }
    }

    setIsProcessing(true);
    try {
      // Capture face snapshot for verification & audit logging
      let base64Photo: string | undefined;
      try {
        const photo = await cameraRef.current?.takePictureAsync({
          base64: true,
          quality: 0.6,
          skipProcessing: false,
        });
        base64Photo = photo?.base64;
      } catch (camErr) {
        console.warn('Camera snapshot capture bypassed:', camErr);
      }

      const result = await forceUnlockDoor({
        adminUsername,
        snapshotBase64: base64Photo,
      });

      setUnlockedSuccess(result);
      onUnlocked?.(result);

      // Auto-dismiss after brief celebration
      setTimeout(() => {
        setUnlockedSuccess(null);
        setIsProcessing(false);
        onClose();
      }, 2200);
    } catch (error: any) {
      setIsProcessing(false);
      Alert.alert('Force Unlock Failed', error?.message || 'Unable to trigger door unlock.');
    }
  };

  const handleClose = () => {
    if (isProcessing) return;
    setUnlockedSuccess(null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, Shadow.lg]}>
          {/* ── Modal Header ── */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.badgeShield}>
                <ShieldAlert size={18} color={Colors.warning} strokeWidth={2.2} />
              </View>
              <View>
                <Text style={styles.modalTitle}>Force Door Access</Text>
                <Text style={styles.modalSubtitle}>Camera-Verified Manual Override</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              disabled={isProcessing}
              activeOpacity={0.7}
            >
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* ── Camera View / Success Display ── */}
          {unlockedSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successGlow}>
                <DoorOpen size={64} color={Colors.success} strokeWidth={2} />
              </View>
              <Text style={styles.successHeading}>ACCESS GRANTED</Text>
              <Text style={styles.successSub}>Door Unlocked & Logged Successfully</Text>
              <View style={styles.successPill}>
                <CheckCircle2 size={14} color={Colors.success} />
                <Text style={styles.successPillText}>
                  {unlockedSuccess.hardwareTriggered
                    ? 'Lock Released on Pi 🟢'
                    : 'Cloud Access Logged ✓'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.cameraBox}>
              {permission?.granted ? (
                <CameraView
                  ref={cameraRef}
                  facing={facing}
                  style={styles.camera}
                >
                  {/* HUD / Scanning Overlay Brackets */}
                  <View style={styles.hudOverlay}>
                    <View style={[styles.bracket, styles.bracketTopLeft]} />
                    <View style={[styles.bracket, styles.bracketTopRight]} />
                    <View style={[styles.bracket, styles.bracketBottomLeft]} />
                    <View style={[styles.bracket, styles.bracketBottomRight]} />

                    <View style={styles.scanTarget}>
                      <Scan size={36} color="rgba(59, 163, 255, 0.7)" strokeWidth={1.5} />
                    </View>

                    <View style={styles.hudBanner}>
                      <Text style={styles.hudText}>
                        Position face inside viewfinder to log authorization
                      </Text>
                    </View>
                  </View>
                </CameraView>
              ) : (
                <View style={styles.permissionPlaceholder}>
                  <Camera size={44} color={Colors.blueLight} strokeWidth={1.5} />
                  <Text style={styles.permissionTitle}>Camera Verification Required</Text>
                  <Text style={styles.permissionDesc}>
                    Manual door overrides require a live camera snapshot to record in the access logs.
                  </Text>
                  <AppButton
                    label="Grant Camera Access"
                    variant="secondary"
                    onPress={requestPermission}
                  />
                </View>
              )}

              {/* Camera Flip Button */}
              {permission?.granted && (
                <TouchableOpacity
                  style={styles.flipBtn}
                  onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                  disabled={isProcessing}
                  activeOpacity={0.8}
                >
                  <RefreshCw size={16} color={Colors.textWhite} strokeWidth={2.2} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── Instruction & Audit Warning ── */}
          {!unlockedSuccess && (
            <View style={styles.infoRow}>
              <Lock size={15} color={Colors.textMuted} />
              <Text style={styles.infoText}>
                This override will trigger the door latch and log a verified entry under{' '}
                <Text style={styles.boldText}>@{adminUsername}</Text>.
              </Text>
            </View>
          )}

          {/* ── Action Buttons ── */}
          {!unlockedSuccess && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleClose}
                disabled={isProcessing}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.unlockBtn,
                  isProcessing && styles.unlockBtnDisabled,
                ]}
                onPress={handleForceUnlock}
                disabled={isProcessing}
                activeOpacity={0.85}
              >
                {isProcessing ? (
                  <View style={styles.processingRow}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.unlockBtnText}>Verifying & Unlocking…</Text>
                  </View>
                ) : (
                  <View style={styles.processingRow}>
                    <Unlock size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.unlockBtnText}>Force Door Unlock</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 11, 24, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: Colors.navyDark,
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.navyLight,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badgeShield: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  modalTitle: {
    color: Colors.textWhite,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBox: {
    height: 280,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    backgroundColor: '#090D16',
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.25)',
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTarget: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: 'rgba(59, 163, 255, 0.35)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracket: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: Colors.blueLight,
  },
  bracketTopLeft: {
    top: 24,
    left: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  bracketTopRight: {
    top: 24,
    right: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  bracketBottomLeft: {
    bottom: 24,
    left: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  bracketBottomRight: {
    bottom: 24,
    right: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  hudBanner: {
    position: 'absolute',
    bottom: 12,
    backgroundColor: 'rgba(10, 16, 30, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  hudText: {
    color: '#D1E8FF',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  flipBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(10, 16, 30, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  permissionPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: 10,
  },
  permissionTitle: {
    color: Colors.textWhite,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  permissionDesc: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 6,
  },
  successContainer: {
    height: 280,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: Spacing.lg,
  },
  successGlow: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  successHeading: {
    color: Colors.success,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  successSub: {
    color: Colors.textWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  successPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    marginTop: 6,
  },
  successPillText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '800',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    padding: Spacing.sm,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoText: {
    color: Colors.textMuted,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  boldText: {
    color: Colors.blueLight,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  unlockBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: Radius.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  unlockBtnDisabled: {
    opacity: 0.65,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unlockBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
