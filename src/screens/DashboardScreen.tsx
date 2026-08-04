import { useCallback, useEffect, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Activity,
  ArrowRight,
  Calendar,
  Clock,
  DoorOpen,
  MapPin,
  ScanFace,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  Unlock,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { ScreenState } from '../components/ScreenState';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { getRecentAccessLogs } from '../services/accessLogService';
import { DashboardCounts, getDashboardCounts } from '../services/dashboardService';
import type { AccessLogWithRelations } from '../types/database';

type DashboardScreenProps = {
  onNavigateTab?: (tab: 'faculty' | 'schedule' | 'records' | 'monitoring') => void;
};

export function DashboardScreen({ onNavigateTab }: DashboardScreenProps) {
  const [counts, setCounts] = useState<DashboardCounts | null>(null);
  const [recentLogs, setRecentLogs] = useState<AccessLogWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [nextCounts, logs] = await Promise.all([
        getDashboardCounts(),
        getRecentAccessLogs(4),
      ]);
      setCounts(nextCounts);
      setRecentLogs(logs);
    } catch (err: any) {
      setError(err?.message || 'Failed to load dashboard data');
    }
  }, []);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  if (loading) {
    return <ScreenState loading message="Loading dashboard…" />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={Colors.blue} />
      }
    >
      {/* ── Hero Banner ── */}
      <View style={[styles.heroCard, Shadow.md]}>
        <View style={styles.heroTop}>
          <View style={styles.heroTextGroup}>
            <View style={styles.greetingBadge}>
              <Sparkles size={13} color={Colors.blueLight} strokeWidth={2.5} />
              <Text style={styles.greetingBadgeText}>ADMIN CONTROL CENTER</Text>
            </View>
            <Text style={styles.heroTitle}>Overview & Status</Text>
            <Text style={styles.heroSub}>CCS Facial Recognition Laboratory Access</Text>
          </View>
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusPillText}>System Operational</Text>
          </View>
          <Text style={styles.timeTag}>
            {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </Text>
        </View>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* ── Quick Action Shortcuts ── */}
      <View style={styles.quickActionsRow}>
        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => onNavigateTab?.('faculty')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#EBF5FF' }]}>
            <ScanFace size={18} color={Colors.blue} strokeWidth={2} />
          </View>
          <Text style={styles.actionChipText}>Enroll Face</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => onNavigateTab?.('schedule')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#F5F3FF' }]}>
            <Calendar size={18} color="#7C3AED" strokeWidth={2} />
          </View>
          <Text style={styles.actionChipText}>Schedule</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionChip}
          onPress={() => onNavigateTab?.('monitoring')}
          activeOpacity={0.8}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: '#D1FAE5' }]}>
            <Activity size={18} color={Colors.success} strokeWidth={2} />
          </View>
          <Text style={styles.actionChipText}>Live Feed</Text>
        </TouchableOpacity>
      </View>

      {/* ── Metrics Grid (2x2) ── */}
      <Text style={styles.sectionHeader}>Key Metrics</Text>
      <View style={styles.metricsGrid}>
        <MetricCard
          label="Total Faculty"
          value={counts?.facultyCount ?? 0}
          icon={Users}
          accent={Colors.blue}
          bg="#EBF5FF"
          onPress={() => onNavigateTab?.('faculty')}
        />
        <MetricCard
          label="Laboratories"
          value={counts?.laboratoryCount ?? 0}
          icon={DoorOpen}
          accent="#7C3AED"
          bg="#F5F3FF"
        />
        <MetricCard
          label="Access Today"
          value={counts?.todayAccessCount ?? 0}
          icon={Unlock}
          accent={Colors.success}
          bg="#D1FAE5"
          onPress={() => onNavigateTab?.('records')}
        />
        <MetricCard
          label="System Mode"
          valueText="Active"
          icon={Activity}
          accent="#0EA5E9"
          bg="#E0F2FE"
          onPress={() => onNavigateTab?.('monitoring')}
        />
      </View>

      {/* ── Recent Activity Section ── */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeader}>Recent Entry Activity</Text>
        <TouchableOpacity
          style={styles.viewAllBtn}
          onPress={() => onNavigateTab?.('records')}
          activeOpacity={0.7}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ArrowRight size={14} color={Colors.blue} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      <View style={[styles.cardContainer, Shadow.sm]}>
        {recentLogs.length === 0 ? (
          <Text style={styles.emptyLogsText}>No recent access attempts recorded.</Text>
        ) : (
          recentLogs.map((log, index) => {
            const granted = log.decision === 'granted';
            const logTime = new Date(log.created_at);
            const formattedTime = logTime.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            });

            return (
              <View
                key={log.id}
                style={[
                  styles.logRow,
                  index < recentLogs.length - 1 && styles.logRowBorder,
                ]}
              >
                <View style={[styles.logStatusDot, { backgroundColor: granted ? Colors.success : Colors.danger }]} />
                <View style={styles.logBody}>
                  <Text style={styles.logName} numberOfLines={1}>
                    {log.profiles?.name ?? 'Unknown Faculty'}
                  </Text>
                  <Text style={styles.logLab} numberOfLines={1}>
                    {log.laboratories?.name ?? 'CCS Laboratory'}  ·  {formattedTime}
                  </Text>
                </View>
                <View style={[styles.logBadge, granted ? styles.badgeGranted : styles.badgeDenied]}>
                  <Text style={[styles.logBadgeText, granted ? styles.textGranted : styles.textDenied]}>
                    {granted ? 'GRANTED' : 'DENIED'}
                  </Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* ── Operating Hours Widget ── */}
      <Text style={styles.sectionHeader}>Facility Info</Text>
      <View style={[styles.infoCard, Shadow.sm]}>
        <View style={styles.infoRow}>
          <View style={styles.infoLabelGroup}>
            <Calendar size={16} color={Colors.blue} strokeWidth={2} />
            <Text style={styles.infoLabel}>Days Active</Text>
          </View>
          <Text style={styles.infoValue}>Monday – Saturday</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoLabelGroup}>
            <Clock size={16} color={Colors.blue} strokeWidth={2} />
            <Text style={styles.infoLabel}>Hours</Text>
          </View>
          <Text style={styles.infoValue}>7:00 AM – 5:00 PM</Text>
        </View>

        <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
          <View style={styles.infoLabelGroup}>
            <MapPin size={16} color={Colors.blue} strokeWidth={2} />
            <Text style={styles.infoLabel}>Location</Text>
          </View>
          <Text style={styles.infoValue}>CCS Computer Lab</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function MetricCard({
  label,
  value,
  valueText,
  icon: Icon,
  accent,
  bg,
  onPress,
}: {
  label: string;
  value?: number;
  valueText?: string;
  icon: LucideIcon;
  accent: string;
  bg: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.metricCard, Shadow.sm]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
    >
      <View style={styles.metricTop}>
        <View style={[styles.iconBubble, { backgroundColor: bg }]}>
          <Icon size={20} color={accent} strokeWidth={2.2} />
        </View>
        <ArrowRight size={14} color={Colors.textMuted} strokeWidth={2} />
      </View>

      <Text style={[styles.metricValue, { color: accent }]}>
        {valueText ?? value?.toLocaleString() ?? 0}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
  },

  // ── Hero Banner ───────────────────────────
  heroCard: {
    backgroundColor: Colors.navyDark,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.navyLight,
    gap: 16,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  heroTextGroup: {
    gap: 4,
  },
  greetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  greetingBadgeText: {
    color: Colors.blueLight,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroTitle: {
    color: Colors.textWhite,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  heroSub: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  heroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  statusPillText: {
    color: Colors.success,
    fontSize: 11,
    fontWeight: '700',
  },
  timeTag: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Error ─────────────────────────────────
  errorBox: {
    backgroundColor: Colors.dangerBg,
    borderRadius: Radius.sm,
    padding: Spacing.md,
  },
  errorText: {
    color: Colors.danger,
    fontWeight: '600',
  },

  // ── Quick Actions ─────────────────────────
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  // ── Section Headers ───────────────────────
  sectionHeader: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewAllText: {
    color: Colors.blue,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Metrics Grid (2x2) ────────────────────
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  metricCard: {
    width: '48.5%',
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 4,
  },
  metricTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metricLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Recent Activity ───────────────────────
  cardContainer: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.xs,
  },
  emptyLogsText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 20,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 10,
  },
  logRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  logBody: {
    flex: 1,
    gap: 2,
  },
  logName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  logLab: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  logBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeGranted: {
    backgroundColor: Colors.successBg,
  },
  badgeDenied: {
    backgroundColor: Colors.dangerBg,
  },
  logBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  textGranted: {
    color: Colors.success,
  },
  textDenied: {
    color: Colors.danger,
  },

  // ── Facility Info ─────────────────────────
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  infoLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
