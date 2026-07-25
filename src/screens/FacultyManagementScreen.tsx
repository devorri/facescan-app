import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
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
  // 🔥 NEW: Track enrollment status for the selected faculty
  const [enrollmentStatus, setEnrollmentStatus] = useState<string>('idle');
  // 🔥 NEW: Auto-reset timer reference
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFaculty = useCallback(async () => {
    const rows = await listFaculty();
    setFaculty(rows);

    // 🔥 Update selected faculty status if it exists
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

  // 🔥 NEW: Clean up timer on unmount
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

  // 🔥 FIXED: Poll status with enrollment status reset
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

      // 🔥 Check and reset stale enrollment status for selected faculty
      if (selectedFaculty) {
        const { data } = await supabase
          .from('profiles')
          .select('camera_status')
          .eq('id', selectedFaculty.id)
          .single();

        if (data?.camera_status) {
          const newStatus = data.camera_status;
          setEnrollmentStatus(newStatus);

          // 🔥 Auto-reset failed status after 3 seconds
          if (newStatus === 'failed_camera_offline' ||
            newStatus === 'failed_camera_error' ||
            newStatus === 'failed_no_face') {

            // Clear any existing timer
            if (resetTimerRef.current) {
              clearTimeout(resetTimerRef.current);
            }

            // Set new timer
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

    // Check if Pi is in enrollment mode
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

    // 🔥 Reset enrollment status before starting
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

  // 🔥 Helper to get enrollment status display
  const getEnrollmentStatusDisplay = () => {
    switch (enrollmentStatus) {
      case 'idle':
        return { text: 'IDLE — Awaiting enrollment', color: Colors.textSecondary };
      case 'pending':
        return { text: 'PENDING — Waiting for Pi...', color: '#FFA500' };
      case 'capturing':
        return { text: 'CAPTURING — Pi is capturing...', color: '#3b82f6' };
      case 'completed':
        return { text: '✅ COMPLETED — Face enrolled!', color: Colors.success };
      case 'failed':
        return { text: '❌ FAILED — Capture failed', color: Colors.danger };
      case 'failed_camera_offline':
        return { text: '❌ FAILED — Camera offline', color: Colors.danger };
      case 'failed_camera_error':
        return { text: '❌ FAILED — Camera error', color: Colors.danger };
      case 'failed_no_face':
        return { text: '❌ FAILED — No face detected', color: Colors.danger };
      default:
        return { text: enrollmentStatus || 'IDLE', color: Colors.textSecondary };
    }
  };

  if (loading) {
    return <ScreenState loading message="Loading faculty" />;
  }

  const enrollmentDisplay = getEnrollmentStatusDisplay();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Faculty Management</Text>

      <View style={styles.form}>
        <FormField label="Full Name" value={name} onChangeText={setName} placeholder="Enter full name" />
        <FormField label="Department / Role" value={role} onChangeText={setRole} placeholder="e.g. CCS Instructor" />
        <View style={styles.actions}>
          <AppButton
            label={selectedFaculty ? 'Update Profile' : 'Register Faculty'}
            loading={saving}
            onPress={saveFaculty}
          />
          <AppButton label="Clear Form" variant="secondary" onPress={resetForm} />
        </View>
      </View>

      <View style={styles.cameraSection}>
        <Text style={styles.sectionTitle}>Raspberry Pi Camera Capture (Recommended)</Text>
        <FormField
          label="Raspberry Pi IP Address"
          value={piIp}
          onChangeText={setPiIp}
          placeholder="192.168.100.19"
        />

        <View style={styles.debugContainer}>
          <AppButton
            label="🐛 Debug Database Status"
            variant="secondary"
            onPress={debugDatabase}
          />
          {debugInfo !== '' && (
            <View style={styles.debugBox}>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </View>
          )}
        </View>

        {/* Pi Mode Control */}
        <View style={styles.modeControl}>
          <Text style={styles.sectionTitle}>Pi Mode Control</Text>
          <View style={styles.modeButtons}>
            <AppButton
              label="🔒 Recognition"
              variant={currentMode === 'recognition' ? 'primary' : 'secondary'}
              onPress={() => switchPiMode('recognition')}
              disabled={changingMode}
            />
            <AppButton
              label="📸 Enrollment"
              variant={currentMode === 'enrollment' ? 'primary' : 'secondary'}
              onPress={() => switchPiMode('enrollment')}
              disabled={changingMode}
            />
            <AppButton
              label="💤 Idle"
              variant={currentMode === 'idle' ? 'primary' : 'secondary'}
              onPress={() => switchPiMode('idle')}
              disabled={changingMode}
            />
          </View>
          <Text style={styles.modeDescription}>
            {currentMode === 'recognition' && '🟢 Normal operation - face recognition active'}
            {currentMode === 'enrollment' && '🟠 Enrollment mode - ready to capture faces'}
            {currentMode === 'idle' && '⚪ System idle - no processing'}
          </Text>
          {changingMode && <Text style={styles.modeDescription}>⏳ Changing mode...</Text>}
        </View>

        {/* Live Pi Camera Telemetry Card */}
        <View style={styles.statusBox}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Pi Server Status:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: piStatus?.online ? Colors.success : Colors.warning },
              ]}
            >
              {checkingStatus
                ? 'Checking... ⏳'
                : piStatus?.online
                  ? 'Online 🟢'
                  : 'Offline / Unreachable 🔴'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Pi Camera Readiness:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: piStatus?.cameraReady ? Colors.success : Colors.warning },
              ]}
            >
              {piStatus?.cameraReady ? 'Camera Ready 🟢' : 'Camera Unavailable ⚠️'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Face Position Check:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: piStatus?.faceDetected ? Colors.success : Colors.warning },
              ]}
            >
              {piStatus?.faceDetected
                ? 'Face Detected in View! 👤🟢'
                : 'No Face Detected in Camera ⚠️'}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Current Mode:</Text>
            <Text
              style={[
                styles.statusValue,
                {
                  color: currentMode === 'recognition' ? Colors.success :
                    currentMode === 'enrollment' ? '#FFA500' :
                      Colors.textSecondary
                },
              ]}
            >
              {currentMode.toUpperCase()}
            </Text>
          </View>

          {/* 🔥 NEW: Enrollment Status Row */}
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Enrollment Status:</Text>
            <Text
              style={[
                styles.statusValue,
                { color: enrollmentDisplay.color },
              ]}
            >
              {enrollmentDisplay.text}
            </Text>
          </View>

          {piStatus?.message && (
            <Text style={styles.statusMessageText}>{piStatus.message}</Text>
          )}

          <AppButton
            label={checkingStatus ? 'Checking Status...' : 'Check Camera Status 🔄'}
            variant="secondary"
            loading={checkingStatus}
            onPress={pollStatus}
          />
        </View>

        {countdown !== null && (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownText}>Capturing in {countdown}...</Text>
          </View>
        )}

        <View style={styles.actions}>
          <AppButton
            label="CAPTURE NOW 📷"
            disabled={!selectedFaculty}
            loading={enrollingPi && countdown === null}
            onPress={() => captureViaPiWithCountdown(0)}
          />
          <AppButton
            label="Capture (3s Countdown) ⏱️"
            variant="secondary"
            disabled={!selectedFaculty}
            loading={enrollingPi && countdown !== null}
            onPress={() => captureViaPiWithCountdown(3)}
          />
        </View>

        <Text style={styles.selectedFacultyText}>
          {selectedFaculty
            ? `👤 Enrolling: ${selectedFaculty.name} (${selectedFaculty.face_embedding ? 'Face Enrolled ✅' : 'Face Pending ⚠️'
            })`
            : 'Select a faculty member below to enroll facial data.'}
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: Spacing.sm }]}>Fallback: Phone Camera Capture</Text>
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

      <Text style={styles.sectionTitle}>Registered Faculty</Text>
      <FlatList
        scrollEnabled={false}
        data={faculty}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.muted}>No faculty records found.</Text>}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSubtitle}>
                {item.role} •{' '}
                <Text
                  style={[
                    styles.statusText,
                    { color: item.face_embedding ? Colors.success : Colors.warning },
                  ]}
                >
                  {item.face_embedding ? 'Face Registered' : 'No Face Enrolled'}
                </Text>
              </Text>
            </View>
            <View style={styles.rowActions}>
              <AppButton label="Edit" variant="secondary" onPress={() => selectFaculty(item)} />
              <AppButton label="Delete" variant="danger" onPress={() => removeFaculty(item)} />
            </View>
          </View>
        )}
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
    paddingBottom: Spacing.xxl,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
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
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  cameraSection: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
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
  muted: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  selectedFacultyText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: Colors.surfaceAlt,
    padding: 10,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusBox: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  statusMessageText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 4,
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
  listContainer: {
    gap: Spacing.sm,
  },
  row: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  rowBody: {
    flex: 1,
    gap: 4,
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
  statusText: {
    fontWeight: '800',
  },
  separator: {
    height: 8,
  },
  modeControl: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  modeDescription: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
  },
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
});