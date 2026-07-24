import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { listAccessLogs } from '../services/accessLogService';
import type { AccessLogWithRelations } from '../types/database';

export function AccessRecordsScreen() {
  const [logs, setLogs] = useState<AccessLogWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setError(null);
    const rows = await listAccessLogs(100);
    setLogs(rows);
  }, []);

  useEffect(() => {
    loadLogs()
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [loadLogs]);

  const refresh = async () => {
    setRefreshing(true);
    loadLogs()
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setRefreshing(false));
  };

  if (loading) {
    return <ScreenState loading message="Loading access records" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Access History</Text>
      <Text style={styles.subheading}>Logs of recent laboratory entries</Text>
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}
      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.blue} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<ScreenState message="No access records found" />}
        renderItem={({ item }) => <AccessRecordRow log={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function AccessRecordRow({ log }: { log: AccessLogWithRelations }) {
  const createdAt = new Date(log.created_at);
  const granted = log.decision === 'granted';

  return (
    <View style={[styles.row, Shadow.sm]}>
      <View style={styles.rowHeader}>
        <View style={styles.titleWrapper}>
          <Text style={styles.avatar}>👤</Text>
          <Text style={styles.rowTitle}>{log.profiles?.name ?? 'Unknown Faculty'}</Text>
        </View>
        <View style={[styles.badge, granted ? styles.grantedBadge : styles.deniedBadge]}>
          <Text style={[styles.badgeText, granted ? styles.grantedText : styles.deniedText]}>
            {granted ? 'GRANTED' : 'DENIED'}
          </Text>
        </View>
      </View>
      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>🏫</Text>
          <Text style={styles.detailText}>{log.laboratories?.name ?? 'CCS Laboratory'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailIcon}>📅</Text>
          <Text style={styles.detailText}>
            {createdAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at{' '}
            {createdAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
          </Text>
        </View>
        {log.reason && (
          <View style={[styles.detailRow, styles.reasonRow]}>
            <Text style={styles.detailIcon}>📝</Text>
            <Text style={styles.reasonText}>{log.reason}</Text>
          </View>
        )}
      </View>
      <View style={[styles.sideIndicator, { backgroundColor: granted ? Colors.success : Colors.danger }]} />
    </View>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
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
    marginTop: -2,
    marginBottom: Spacing.lg,
  },
  errorBox: {
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    fontWeight: '600',
  },
  list: {
    paddingBottom: Spacing.xl,
  },
  row: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  titleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  avatar: {
    fontSize: 16,
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    flex: 1,
  },
  detailsContainer: {
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailIcon: {
    fontSize: 13,
    width: 16,
    textAlign: 'center',
  },
  detailText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reasonRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#F0F5FA',
  },
  reasonText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  grantedBadge: {
    backgroundColor: Colors.successBg,
  },
  deniedBadge: {
    backgroundColor: Colors.dangerBg,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  grantedText: {
    color: Colors.success,
  },
  deniedText: {
    color: Colors.danger,
  },
  sideIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
  separator: {
    height: 12,
  },
});
