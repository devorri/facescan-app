import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  type LucideIcon,
  UserCircle,
  Users,
} from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/constants/design';
import { AccessRecordsScreen } from '@/screens/AccessRecordsScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { FacultyManagementScreen } from '@/screens/FacultyManagementScreen';
import { LaboratorySchedulingScreen } from '@/screens/LaboratorySchedulingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { RealtimeMonitoringScreen } from '@/screens/RealtimeMonitoringScreen';
import type { AdminUser } from '@/services/authService';

type TabKey = 'dashboard' | 'faculty' | 'schedule' | 'records' | 'monitoring' | 'profile';

const tabs: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'faculty', label: 'Faculty', icon: Users },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'records', label: 'Records', icon: ClipboardList },
  { key: 'monitoring', label: 'Monitor', icon: Activity },
  { key: 'profile', label: 'Profile', icon: UserCircle },
];

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const insets = useSafeAreaInsets();

  if (!currentAdmin) {
    return (
      <LoginScreen
        onSignedIn={(admin) => {
          setCurrentAdmin(admin);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      {/* ── Dual-Brand Header ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Image
              source={require('@/assets/images/logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.logoBadge}>
            <Image
              source={require('@/assets/images/pampanga-logo.png')}
              style={styles.headerLogo}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>CCS Smartlab</Text>
            <Text style={styles.headerSub}>Province of Pampanga</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.profileChip}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.7}
        >
          <View style={styles.profileDot} />
          <Text style={styles.profileChipText}>@{currentAdmin.username}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {renderScreen(
          activeTab,
          () => {
            setCurrentAdmin(null);
            setActiveTab('dashboard');
          },
          (tab) => setActiveTab(tab),
          currentAdmin.username,
        )}
      </View>

      {/* ── Bottom Tab Navigation Bar ── */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.tabIconWrap, isActive && styles.tabIconWrapActive]}>
                <Icon
                  size={20}
                  color={isActive ? Colors.blueLight : Colors.textMuted}
                  strokeWidth={isActive ? 2.2 : 1.6}
                />
              </View>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function renderScreen(
  activeTab: TabKey,
  onSignedOut: () => void,
  onNavigateTab: (tab: TabKey) => void,
  adminUsername: string,
) {
  switch (activeTab) {
    case 'faculty':
      return <FacultyManagementScreen />;
    case 'schedule':
      return <LaboratorySchedulingScreen />;
    case 'records':
      return <AccessRecordsScreen />;
    case 'monitoring':
      return <RealtimeMonitoringScreen adminUsername={adminUsername} />;
    case 'profile':
      return <ProfileScreen onSignedOut={onSignedOut} adminUsername={adminUsername} />;
    default:
      return <DashboardScreen onNavigateTab={onNavigateTab} adminUsername={adminUsername} />;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.navyDark,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.navyLight,
    backgroundColor: Colors.navyDark,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLogo: {
    width: '100%',
    height: '100%',
  },
  titleWrap: {
    marginLeft: 2,
  },
  title: {
    color: Colors.textWhite,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSub: {
    color: Colors.blueLight,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  profileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 163, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 163, 255, 0.25)',
  },
  profileDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  profileChipText: {
    color: Colors.textWhite,
    fontSize: 11,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    backgroundColor: Colors.surfaceAlt,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.navy,
    borderTopWidth: 1,
    borderTopColor: Colors.navyLight,
    paddingTop: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 4,
  },
  tabIconWrap: {
    width: 40,
    height: 28,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: 'rgba(59, 163, 255, 0.12)',
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.textMuted,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: Colors.blueLight,
    fontWeight: '700',
  },
});
