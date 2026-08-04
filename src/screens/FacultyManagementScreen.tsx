import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ScanFace,
  ShieldCheck,
  ShieldAlert,
  UserPlus,
  Wifi,
  WifiOff,
} from 'lucide-react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { supabase } from '../lib/supabase';
import {
  checkPiCameraStatus,
  createFaculty,
  deleteFaculty,
  enrollFacultyFace,
  enrollFacultyFaceViaPi,
  getPiModeFromDatabase,
  listFaculty,
  setPiMode,
  updateFaculty,
  type PiStatus,
} from '../services/facultyService';
import type { Profile } from '../types/database';

const ITEMS_PER_PAGE = 10;

export function FacultyManagementScreen() {
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [faculty, setFaculty] = useState<Profile[]>([]);
  const [selectedFaculty, setSelectedFaculty] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('faculty');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [piIp, setPiIp] = useState('192.168.100.19');
  const [enrollingPi, setEnrollingPi] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [piStatus, setPiStatus] = useState<PiStatus | null>(null);
  const [currentMode, setCurrentMode] = useState<string>('recognition');
  const [changingMode, setChangingMode] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');
  // Enrollment status tracking
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>('idle');
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // UI collapse states
  const [cameraExpanded, setCameraExpanded] = useState(false);
  const [showPhoneFallback, setShowPhoneFallback] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(faculty.length / ITEMS_PER_PAGE));
  const paginatedFaculty = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return faculty.slice(start, start + ITEMS_PER_PAGE);
  }, [faculty, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [faculty.length, totalPages, currentPage]);

  const loadFaculty = useCallback(async () => {
    const rows = await listFaculty();
    setFaculty(rows);

    // Update selected faculty status if it exists
    if (selectedFaculty) {
      const updated = rows.find(f => f.id === selectedFaculty.id);
      if (updated) {
        setSelectedFaculty(updated);
        setEnrollmentStatus(updated.camera_status || 'idle');
      }
    }
  }, [selectedFaculty]);

  useEffect(() => {
    loadFaculty()
      .catch((error) => Alert.alert('Unable to load faculty', getErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [loadFaculty]);

  // Load initial mode from database
  useEffect(() => {
    getPiModeFromDatabase().then(mode => {
      setCurrentMode(mode);
    }).catch(() => { });
  }, []);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const debugDatabase = async () => {
    try {
      console.log('🔍 Debugging database...');

      const { data: labs, error: labsError } = await supabase
        .from('laboratories')
        .select('*');

      if (labsError) {
        console.error('❌ Labs error:', labsError);
        setDebugInfo(`Error: ${labsError.message}`);
        return;
      }

      console.log('📡 All laboratories:', JSON.stringify(labs, null, 2));

      if (labs && labs.length > 0) {
        const lab = labs[0];
        let statusMsg = `Lab: ${lab.name}\n`;
        statusMsg += `Mode: ${lab.mode}\n`;
        statusMsg += `Pi Status: ${JSON.stringify(lab.pi_status, null, 2)}`;
        setDebugInfo(statusMsg);

        if (lab.pi_status) {
          let ps = lab.pi_status;
          if (typeof ps === 'string') {
            try {
              ps = JSON.parse(ps);
            } catch (e) {
              console.error('Failed to parse pi_status:', e);
            }
          }
          console.log('📡 camera_ready:', ps?.camera_ready);
          console.log('📡 face_detected:', ps?.face_detected);
        }
      } else {
        setDebugInfo('No laboratories found in database!');
      }
    } catch (error: any) {
      console.error('❌ Debug error:', error);
      setDebugInfo(`Error: ${error?.message || String(error)}`);
    }
  };

  const resetForm = () => {
    setSelectedFaculty(null);
    setName('');
    setRole('faculty');
    setEnrollmentStatus('idle');
    setCameraExpanded(false);
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
  };

  const selectFaculty = (profile: Profile) => {
    setSelectedFaculty(profile);
    setName(profile.name);
    setRole(profile.role);
    setEnrollmentStatus(profile.camera_status || 'idle');
    // Auto-expand camera section when a faculty is selected
    setCameraExpanded(true);
  };

  const saveFaculty = async () => {
    if (name.trim().length < 2 || role.trim().length < 2) {
      Alert.alert('Missing details', 'Enter a faculty name and role.');
      return;
    }

    setSaving(true);
    try {
      const saved = selectedFaculty
        ? await updateFaculty({ id: selectedFaculty.id, name, role })
        : await createFaculty({ name, role });

      await loadFaculty();
      setSelectedFaculty(saved);
      setName(saved.name);
      setRole(saved.role);
      Alert.alert(selectedFaculty ? 'Faculty updated' : 'Faculty registered');
    } catch (error) {
      Alert.alert('Unable to save faculty', getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeFaculty = (profile: Profile) => {
    Alert.alert('Delete faculty?', `This will delete ${profile.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFaculty(profile.id);
            if (selectedFaculty?.id === profile.id) resetForm();
            await loadFaculty();
          } catch (error) {
            Alert.alert('Unable to delete faculty', getErrorMessage(error));
          }
        },
      },
    ]);
  };

  // Poll Pi status
  const pollStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      console.log('🔍 Polling Pi status from app...');
      const status = await checkPiCameraStatus(piIp);
      console.log('📡 Status received:', status);
      setPiStatus(status);
      if (status.mode) {
        setCurrentMode(status.mode);
      }

      // Check and reset stale enrollment status for selected faculty
      if (selectedFaculty) {
        const { data } = await supabase
          .from('profiles')
          .select('camera_status')
          .eq('id', selectedFaculty.id)
          .single();

        if (data?.camera_status) {
          const newStatus = data.camera_status;
          setEnrollmentStatus(newStatus);

          // Auto-reset failed status after 3 seconds
          if (newStatus === 'failed_camera_offline' ||
            newStatus === 'failed_camera_error' ||
            newStatus === 'failed_no_face') {

            if (resetTimerRef.current) {
              clearTimeout(resetTimerRef.current);
            }

            resetTimerRef.current = setTimeout(async () => {
              console.log('🔄 Auto-resetting stale enrollment status...');
              await supabase
                .from('profiles')
                .update({ camera_status: 'idle' })
                .eq('id', selectedFaculty.id);
              await loadFaculty();
              setEnrollmentStatus('idle');
              resetTimerRef.current = null;
            }, 3000);
          }
        }
      }
    } catch (error) {
      console.error('❌ Polling error:', error);
      setPiStatus({ online: false, cameraReady: false, faceDetected: false, message: 'Server unreachable', mode: 'unknown' });
    } finally {
      setCheckingStatus(false);
    }
  }, [piIp, selectedFaculty]);

  useEffect(() => {
    pollStatus();
    const interval = setInterval(pollStatus, 3000);
    return () => clearInterval(interval);
  }, [pollStatus]);

  const switchPiMode = async (mode: 'recognition' | 'enrollment' | 'idle') => {
    setChangingMode(true);
    try {
      const result = await setPiMode(piIp, mode);
      setCurrentMode(result.mode);
      Alert.alert('Mode Changed', `Pi is now in ${result.mode.toUpperCase()} mode`);
      await pollStatus();
    } catch (error) {
      Alert.alert('Failed to change mode', getErrorMessage(error));
    } finally {
      setChangingMode(false);
    }
  };

  const captureViaPiWithCountdown = async (delaySeconds: number = 0) => {
    if (!selectedFaculty) {
      Alert.alert('Select faculty', 'Save or select a faculty member before face enrollment.');
      return;
    }

    if (currentMode !== 'enrollment') {
      Alert.alert(
        'Wrong Mode',
        'Pi is currently in RECOGNITION mode. Switch to ENROLLMENT mode first.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Switch to Enrollment',
            onPress: async () => {
              await switchPiMode('enrollment');
              captureViaPiWithCountdown(delaySeconds);
            }
          }
        ]
      );
      return;
    }

    setEnrollmentStatus('pending');
    await supabase
      .from('profiles')
      .update({ camera_status: 'pending' })
      .eq('id', selectedFaculty.id);

    setEnrollingPi(true);
    if (delaySeconds > 0) {
      for (let i = delaySeconds; i > 0; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(null);
    }

    try {
      const updated = await enrollFacultyFaceViaPi(selectedFaculty.id, piIp, 0);
      setSelectedFaculty(updated);
      setEnrollmentStatus('completed');
      await loadFaculty();
      Alert.alert('Pi Camera Capture Successful! ✅', `Facial data registered for ${updated.name}.`);
    } catch (error) {
      setEnrollmentStatus('failed');
      Alert.alert('Pi Capture Failed', getErrorMessage(error));
    } finally {
      setEnrollingPi(false);
      setCountdown(null);
      pollStatus();
    }
  };

  const captureAndEnroll = async () => {
    if (!selectedFaculty) {
      Alert.alert('Select faculty', 'Save or select a faculty member before face enrollment.');
      return;
    }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Camera permission required', 'Camera access is needed for face enrollment.');
        return;
      }
    }

    setEnrolling(true);
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        base64: true,
        quality: 0.75,
        skipProcessing: false,
      });

      if (!photo?.base64) {
        throw new Error('No camera image was captured.');
      }

      const updated = await enrollFacultyFace(
        selectedFaculty.id,
        `data:image/jpeg;base64,${photo.base64}`,
      );
      setSelectedFaculty(updated);
      await loadFaculty();
      Alert.alert('Facial data saved', 'Face embedding has been registered or updated.');
    } catch (error) {
      Alert.alert('Face enrollment failed', getErrorMessage(error));
    } finally {
      setEnrolling(false);
    }
  };

  const getEnrollmentStatusDisplay = () => {
    switch (enrollmentStatus) {
      case 'idle':
        return { text: 'Awaiting enrollment', color: Colors.textSecondary };
      case 'pending':
        return { text: 'Waiting for Pi…', color: '#FFA500' };
      case 'capturing':
        return { text: 'Pi is capturing…', color: '#3b82f6' };
      case 'completed':
        return { text: 'Face enrolled ✓', color: Colors.success };
      case 'failed':
        return { text: 'Capture failed', color: Colors.danger };
      case 'failed_camera_offline':
        return { text: 'Camera offline', color: Colors.danger };
      case 'failed_camera_error':
        return { text: 'Camera error', color: Colors.danger };
      case 'failed_no_face':
        return { text: 'No face detected', color: Colors.danger };
      default:
        return { text: enrollmentStatus || 'Idle', color: Colors.textSecondary };
    }
  };

  if (loading) {
    return <ScreenState loading message="Loading faculty" />;
  }

  const enrollmentDisplay = getEnrollmentStatusDisplay();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Faculty Management</Text>

      {/* ── Registration form ── */}
      <View style={styles.card}>
        <FormField label="Full Name" value={name} onChangeText={setName} placeholder="Enter full name" />
        <FormField label="Department / Role" value={role} onChangeText={setRole} placeholder="e.g. CCS Instructor" />
        <View style={styles.actions}>
          <AppButton
            label={selectedFaculty ? 'Update Profile' : 'Register Faculty'}
            loading={saving}
            onPress={saveFaculty}
          />
          <AppButton label="Clear" variant="secondary" onPress={resetForm} />
        </View>
      </View>

      {/* ── Pi Camera Section (collapsible) ── */}
      <TouchableOpacity
        style={styles.sectionToggle}
        onPress={() => setCameraExpanded(!cameraExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionToggleLeft}>
          <Camera size={18} color={Colors.blue} strokeWidth={2} />
          <Text style={styles.sectionToggleTitle}>Pi Camera Enrollment</Text>
        </View>
        <View style={styles.sectionToggleRight}>
          {/* Mini status indicator */}
          <View style={[styles.miniDot, {
            backgroundColor: piStatus?.online ? Colors.success : Colors.danger,
          }]} />
          {cameraExpanded
            ? <ChevronUp size={20} color={Colors.textMuted} strokeWidth={2} />
            : <ChevronDown size={20} color={Colors.textMuted} strokeWidth={2} />
          }
        </View>
      </TouchableOpacity>

      {cameraExpanded && (
        <View style={styles.cameraSection}>
          {/* Selected faculty banner */}
          {selectedFaculty ? (
            <View style={styles.selectedBanner}>
              <ScanFace size={18} color={Colors.blue} strokeWidth={2} />
              <View style={styles.selectedBannerText}>
                <Text style={styles.selectedName}>{selectedFaculty.name}</Text>
                <Text style={[styles.selectedStatus, { color: enrollmentDisplay.color }]}>
                  {enrollmentDisplay.text}
                </Text>
              </View>
              {selectedFaculty.face_embedding ? (
                <ShieldCheck size={20} color={Colors.success} strokeWidth={2} />
              ) : (
                <ShieldAlert size={20} color={Colors.warning} strokeWidth={2} />
              )}
            </View>
          ) : (
            <View style={styles.noSelectionBanner}>
              <Text style={styles.noSelectionText}>Select a faculty member below to enroll facial data</Text>
            </View>
          )}

          {/* Pi IP */}
          <FormField
            label="Raspberry Pi IP"
            value={piIp}
            onChangeText={setPiIp}
            placeholder="192.168.100.19"
          />

          {/* Compact status card */}
          <View style={styles.statusCard}>
            <StatusRow
              label="Server"
              value={piStatus?.online ? 'Online' : 'Offline'}
              color={piStatus?.online ? Colors.success : Colors.danger}
            />
            <StatusRow
              label="Camera"
              value={piStatus?.cameraReady ? 'Ready' : 'Unavailable'}
              color={piStatus?.cameraReady ? Colors.success : Colors.warning}
            />
            <StatusRow
              label="Face"
              value={piStatus?.faceDetected ? 'Detected' : 'None'}
              color={piStatus?.faceDetected ? Colors.success : Colors.textMuted}
            />
            <StatusRow
              label="Mode"
              value={currentMode.toUpperCase()}
              color={currentMode === 'recognition' ? Colors.success : currentMode === 'enrollment' ? '#FFA500' : Colors.textSecondary}
            />
          </View>

          {/* Mode control - compact */}
          <View style={styles.modeRow}>
            {(['recognition', 'enrollment', 'idle'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.modeChip, currentMode === mode && styles.modeChipActive]}
                onPress={() => switchPiMode(mode)}
                disabled={changingMode}
                activeOpacity={0.7}
              >
                <Text style={[styles.modeChipText, currentMode === mode && styles.modeChipTextActive]}>
                  {mode === 'recognition' ? '🔒' : mode === 'enrollment' ? '📸' : '💤'}{' '}
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Countdown overlay */}
          {countdown !== null && (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownText}>Capturing in {countdown}...</Text>
            </View>
          )}

          {/* Capture buttons */}
          <View style={styles.captureActions}>
            <AppButton
              label="Capture Now"
              disabled={!selectedFaculty}
              loading={enrollingPi && countdown === null}
              onPress={() => captureViaPiWithCountdown(0)}
            />
            <AppButton
              label="3s Countdown"
              variant="secondary"
              disabled={!selectedFaculty}
              loading={enrollingPi && countdown !== null}
              onPress={() => captureViaPiWithCountdown(3)}
            />
          </View>

          {/* Phone camera fallback - collapsed */}
          <TouchableOpacity
            style={styles.fallbackToggle}
            onPress={() => setShowPhoneFallback(!showPhoneFallback)}
            activeOpacity={0.7}
          >
            <Text style={styles.fallbackToggleText}>Phone Camera Fallback</Text>
            {showPhoneFallback
              ? <ChevronUp size={16} color={Colors.textMuted} strokeWidth={2} />
              : <ChevronDown size={16} color={Colors.textMuted} strokeWidth={2} />
            }
          </TouchableOpacity>

          {showPhoneFallback && (
            <View style={styles.fallbackContent}>
              {permission?.granted ? (
                <CameraView ref={cameraRef} facing="front" style={styles.camera} />
              ) : (
                <View style={styles.permissionBox}>
                  <Text style={styles.muted}>Camera permission is needed for phone face enrollment.</Text>
                  <AppButton label="Allow Camera Access" variant="secondary" onPress={requestPermission} />
                </View>
              )}
              <AppButton
                label="Capture via Phone Camera"
                variant="secondary"
                disabled={!selectedFaculty}
                loading={enrolling}
                onPress={captureAndEnroll}
              />
            </View>
          )}

          {/* Debug - hidden behind toggle (long press title to reveal) */}
          <TouchableOpacity
            style={styles.fallbackToggle}
            onPress={() => setShowDebug(!showDebug)}
            activeOpacity={0.7}
          >
            <Text style={styles.fallbackToggleText}>Debug Tools</Text>
            {showDebug
              ? <ChevronUp size={16} color={Colors.textMuted} strokeWidth={2} />
              : <ChevronDown size={16} color={Colors.textMuted} strokeWidth={2} />
            }
          </TouchableOpacity>

          {showDebug && (
            <View style={styles.debugContainer}>
              <AppButton
                label="Debug Database Status"
                variant="secondary"
                onPress={debugDatabase}
              />
              <AppButton
                label={checkingStatus ? 'Checking…' : 'Refresh Status'}
                variant="secondary"
                loading={checkingStatus}
                onPress={pollStatus}
              />
              {debugInfo !== '' && (
                <View style={styles.debugBox}>
                  <Text style={styles.debugText}>{debugInfo}</Text>
                </View>
              )}
              {piStatus?.message && (
                <Text style={styles.statusMessage}>{piStatus.message}</Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* ── Faculty list ── */}
      <View style={styles.listHeaderRow}>
        <Text style={styles.sectionTitle}>Registered Faculty ({faculty.length})</Text>
        {totalPages > 1 && (
          <Text style={styles.pageCountHeader}>
            Page {currentPage} of {totalPages}
          </Text>
        )}
      </View>

      <FlatList
        scrollEnabled={false}
        data={paginatedFaculty}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.muted}>No faculty records found.</Text>}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, selectedFaculty?.id === item.id && styles.rowSelected]}
            onPress={() => selectFaculty(item)}
            activeOpacity={0.7}
          >
            {/* Face status icon badge */}
            <View style={[styles.faceBadge, {
              backgroundColor: item.face_embedding ? '#D1FAE5' : '#FEF3C7',
            }]}>
              {item.face_embedding
                ? <ShieldCheck size={18} color={Colors.success} strokeWidth={2} />
                : <ShieldAlert size={18} color={Colors.warning} strokeWidth={2} />
              }
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>{item.role}</Text>
            </View>
            <View style={styles.rowActions}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => removeFaculty(item)}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteBtnText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
      />

      {/* Pagination controls */}
      {totalPages > 1 && (
        <View style={styles.paginationRow}>
          <TouchableOpacity
            style={[styles.pageBtn, currentPage === 1 && styles.pageBtnDisabled]}
            disabled={currentPage === 1}
            onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
            activeOpacity={0.7}
          >
            <ChevronLeft size={16} color={currentPage === 1 ? Colors.textMuted : Colors.textPrimary} />
            <Text style={[styles.pageBtnText, currentPage === 1 && styles.pageBtnTextDisabled]}>Previous</Text>
          </TouchableOpacity>

          <Text style={styles.pageIndicator}>
            {currentPage} / {totalPages}
          </Text>

          <TouchableOpacity
            style={[styles.pageBtn, currentPage === totalPages && styles.pageBtnDisabled]}
            disabled={currentPage === totalPages}
            onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            activeOpacity={0.7}
          >
            <Text style={[styles.pageBtnText, currentPage === totalPages && styles.pageBtnTextDisabled]}>Next</Text>
            <ChevronRight size={16} color={currentPage === totalPages ? Colors.textMuted : Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

function StatusRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={[styles.statusValue, { color }]}>{value}</Text>
    </View>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
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
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.xs,
  },

  // ── Section toggle ─────────────────────────
  sectionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  sectionToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionToggleTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  sectionToggleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // ── Camera section ─────────────────────────
  cameraSection: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },

  // ── Selected faculty banner ────────────────
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF5FF',
    borderRadius: Radius.sm,
    padding: Spacing.md,
    gap: 10,
    borderWidth: 1,
    borderColor: '#BFE0FF',
  },
  selectedBannerText: {
    flex: 1,
    gap: 2,
  },
  selectedName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  selectedStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  noSelectionBanner: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  noSelectionText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Status card ────────────────────────────
  statusCard: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  statusLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Mode control ───────────────────────────
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeChipActive: {
    backgroundColor: '#EBF5FF',
    borderColor: Colors.blue,
  },
  modeChipText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  modeChipTextActive: {
    color: Colors.blue,
  },

  // ── Capture ────────────────────────────────
  captureActions: {
    flexDirection: 'row',
    gap: 10,
  },
  countdownBox: {
    backgroundColor: '#3b82f6',
    borderRadius: Radius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  countdownText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },

  // ── Fallback toggle ────────────────────────
  fallbackToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  fallbackToggleText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackContent: {
    gap: Spacing.md,
  },
  camera: {
    aspectRatio: 3 / 4,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: Colors.border,
  },
  permissionBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    gap: Spacing.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // ── Debug ──────────────────────────────────
  debugContainer: {
    gap: Spacing.sm,
  },
  debugBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  debugText: {
    color: '#00ff00',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  statusMessage: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },

  // ── Faculty list ───────────────────────────
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: Spacing.xs,
  },
  listContainer: {
    gap: Spacing.sm,
  },
  row: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  rowSelected: {
    borderColor: Colors.blue,
    backgroundColor: '#FAFCFF',
  },
  faceBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  rowSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.dangerBg,
  },
  deleteBtnText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  muted: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  separator: {
    height: 8,
  },
  listHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  pageCountHeader: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.xs,
  },
  pageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  pageBtnDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.card,
    borderColor: Colors.border,
  },
  pageBtnText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  pageBtnTextDisabled: {
    color: Colors.textMuted,
  },
  pageIndicator: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
});