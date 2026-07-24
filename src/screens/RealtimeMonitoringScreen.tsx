import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import {
  getRecentAccessLogs,
  hydrateAccessLog,
  subscribeToAccessLogInserts,
} from '../services/accessLogService';
import type { AccessLogWithRelations } from '../types/database';

export function RealtimeMonitoringScreen() {
  const [logs, setLogs] = useState<AccessLogWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setError(null);
    const nextLogs = await getRecentAccessLogs();
    setLogs(nextLogs);
  }, []);

  useEffect(() => {
    loadLogs()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadLogs]);

  useEffect(() => {
    const channel = subscribeToAccessLogInserts(
      async (log) => {
        try {
          const hydrated = await hydrateAccessLog(log.id);
          setLogs((current) => [hydrated ?? log, ...current].slice(0, 30));
        } catch {
          setLogs((current) => [log, ...current].slice(0, 30));
        }
      },
      setError,
    );

    return () => {
      channel.unsubscribe();
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    loadLogs()
      .catch((err) => setError(err.message))
      .finally(() => setRefreshing(false));
  };

  if (loading) {
    return <ScreenState loading message="Loading recent access attempts" />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.heading}>Real-Time Monitor</Text>
          <Text style={styles.subheading}>Live stream of laboratory entry scans</Text>
        </View>
        <View style={styles.liveIndicator}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>
      
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
        ListEmptyComponent={<ScreenState message="No access attempts recorded yet" />}
        renderItem={({ item }) => <AccessLogRow log={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

function AccessLogRow({ log }: { log: AccessLogWithRelations }) {
  const granted = log.decision === 'granted';
  const facultyName = log.profiles?.name ?? 'Unknown Faculty';
  const labName = log.laboratories?.name ?? 'CCS Laboratory';

  return (
    <View style={[styles.row, Shadow.sm]}>
      <View style={[styles.statusIndicator, { backgroundColor: granted ? Colors.success : Colors.danger }]} />
      <View style={styles.rowBody}>
        <View style={styles.nameRow}>
          <Text style={styles.rowTitle}>{facultyName}</Text>
          <Text style={styles.time}>{new Date(log.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}</Text>
        </View>
        <Text style={styles.rowSubtitle}>📍 {labName}</Text>
        {log.reason && (
          <View style={styles.reasonContainer}>
            <Text style={styles.reasonText}>Reason: {log.reason}</Text>
          </View>
        )}
      </View>
      <View style={[styles.badge, granted ? styles.grantedBadge : styles.deniedBadge]}>
        <Text style={[styles.badgeText, granted ? styles.grantedText : styles.deniedText]}>
          {granted ? 'OK' : 'FAIL'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.lg,
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
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#BFE0FF',
    marginTop: 4,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  liveText: {
    color: Colors.blue,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
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
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    flexDirection: 'row',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  statusIndicator: {
    width: 6,
    height: '100%',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
  },
  rowBody: {
    flex: 1,
    paddingLeft: Spacing.sm,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingRight: Spacing.sm,
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
  reasonContainer: {
    marginTop: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  reasonText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: Spacing.xs,
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
  },
  grantedText: {
    color: Colors.success,
  },
  deniedText: {
    color: Colors.danger,
  },
  time: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  separator: {
    height: 10,
  },
});
