import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { FormField } from '../components/FormField';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import {
  createFaculty,
  deleteFaculty,
  enrollFacultyFace,
  listFaculty,
  updateFaculty,
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

  const loadFaculty = useCallback(async () => {
    const rows = await listFaculty();
    setFaculty(rows);
  }, []);

  useEffect(() => {
    loadFaculty()
      .catch((error) => Alert.alert('Unable to load faculty', getErrorMessage(error)))
      .finally(() => setLoading(false));
  }, [loadFaculty]);

  const resetForm = () => {
    setSelectedFaculty(null);
    setName('');
    setRole('faculty');
  };

  const selectFaculty = (profile: Profile) => {
    setSelectedFaculty(profile);
    setName(profile.name);
    setRole(profile.role);
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

  if (loading) {
    return <ScreenState loading message="Loading faculty" />;
  }

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
        <Text style={styles.sectionTitle}>Facial Recognition Enrollment</Text>
        {permission?.granted ? (
          <CameraView ref={cameraRef} facing="front" style={styles.camera} />
        ) : (
          <View style={styles.permissionBox}>
            <Text style={styles.muted}>Camera permission is needed for face enrollment.</Text>
            <AppButton label="Allow Camera Access" variant="secondary" onPress={requestPermission} />
          </View>
        )}
        <AppButton
          label="Capture Face"
          disabled={!selectedFaculty}
          loading={enrolling}
          onPress={captureAndEnroll}
        />
        <Text style={styles.selectedFacultyText}>
          {selectedFaculty
            ? `👤 Enrolling: ${selectedFaculty.name} (${
                selectedFaculty.face_embedding ? 'Face Enrolled ✅' : 'Face Pending ⚠️'
              })`
            : 'Select a faculty member below to enroll facial data.'}
        </Text>
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
});
