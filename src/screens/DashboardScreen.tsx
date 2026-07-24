import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { DashboardCounts, getDashboardCounts } from '../services/dashboardService';

export function DashboardScreen() {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    setError(null);
    const nextCounts = await getDashboardCounts();
    setCounts(nextCounts);
  }, []);

  useEffect(() => {
    loadCounts()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadCounts]);

  const refresh = async () => {
    setRefreshing(true);
    loadCounts()
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  };

  if (loading) {
    return <ScreenState loading message="Loading dashboard" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.blue} />}
    >
      <Text style={styles.heading}>Overview</Text>
      <Text style={styles.subheading}>CCS Laboratory Admin Console</Text>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      <View style={styles.grid}>
        <MetricCard
          label="Total Faculty"
          value={counts?.facultyCount ?? 0}
          icon="👥"
          accent={Colors.blue}
          bg="#EBF5FF"
        />
        <MetricCard
          label="Laboratories"
          value={counts?.laboratoryCount ?? 0}
          icon="🏛️"
          accent="#7C3AED"
          bg="#F5F3FF"
        />
        <MetricCard
          label="Access Today"
          value={counts?.todayAccessCount ?? 0}
          icon="🔓"
          accent={Colors.success}
          bg={Colors.successBg}
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Operating Hours</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📅 Days</Text>
          <Text style={styles.infoValue}>Monday – Saturday</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>⏰ Hours</Text>
          <Text style={styles.infoValue}>7:00 AM – 5:00 PM</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>📍 Room</Text>
          <Text style={styles.infoValue}>CCS Laboratory</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function MetricCard({
  label, value, icon, accent, bg,
}: {
  label: string; value: number; icon: string; accent: string; bg: string;
}) {
  return (
    <View style={[styles.card, Shadow.md]}>
      <View style={[styles.iconBubble, { backgroundColor: bg }]}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <Text style={[styles.value, { color: accent }]}>{value.toLocaleString()}</Text>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
    </View>
  );
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
  subheading: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: -Spacing.sm,
  },
  errorBox: {
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    fontWeight: '600',
  },
  grid: {
    gap: Spacing.md,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    overflow: 'hidden',
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  iconText: {
    fontSize: 22,
  },
  value: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  label: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  infoTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  infoValue: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
});
