import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  FileSpreadsheet,
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
import { ReportScreen } from '@/screens/ReportScreen';
import type { AuthUser } from '@/services/authService';

type TabKey = 'dashboard' | 'faculty' | 'schedule' | 'records' | 'reports' | 'monitoring' | 'profile';

const allTabs: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { key: 'faculty', label: 'Faculty', icon: Users },
  { key: 'schedule', label: 'Schedule', icon: CalendarDays },
  { key: 'records', label: 'Records', icon: ClipboardList },
  { key: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { key: 'monitoring', label: 'Monitor', icon: Activity },
  { key: 'profile', label: 'Profile', icon: UserCircle },
];

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const insets = useSafeAreaInsets();

  if (!currentUser) {
    return (
      <LoginScreen
        onSignedIn={(user) => {
          setCurrentUser(user);
          setActiveTab('dashboard');
        }}
      />
    );
  }

  // Filter tabs based on role:
  // Custodian: has full administrative access (Home, Faculty, Schedule, Records, Reports, Monitor, Profile)
  // Faculty: ONLY sees Home, My Schedule, and Profile (no access to faculty management, audit records, reports, or CCTV monitor)
  const visibleTabs = allTabs
    .filter((tab) => {
      if (currentUser.role === 'custodian') return true;
      return tab.key === 'dashboard' || tab.key === 'schedule' || tab.key === 'profile';
    })
    .map((tab) => {
      if (currentUser.role === 'faculty' && tab.key === 'schedule') {
        return { ...tab, label: 'My Schedule' };
      }
      return tab;
    });

  const handleNavigateTab = (tab: TabKey) => {
    // Prevent faculty from navigating to custodian-only tabs via any action
    if (currentUser.role === 'faculty') {
      if (tab !== 'dashboard' && tab !== 'schedule' && tab !== 'profile') {
        return;
      }
    }
    setActiveTab(tab);
  };

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
          <View
            style={[
              styles.profileDot,
              { backgroundColor: currentUser.role === 'custodian' ? Colors.blueLight : '#F59E0B' },
            ]}
          />
          <Text style={styles.profileChipText}>@{currentUser.username}</Text>
          <View
            style={[
              styles.roleBadgeHeader,
              currentUser.role === 'custodian' ? styles.roleBadgeCustodian : styles.roleBadgeFaculty,
            ]}
          >
            <Text
              style={[
                styles.roleBadgeHeaderText,
                currentUser.role === 'custodian' ? styles.roleTextCustodian : styles.roleTextFaculty,
              ]}
            >
              {currentUser.role === 'custodian' ? 'Custodian' : 'Faculty'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {renderScreen(
          activeTab,
          () => {
            setCurrentUser(null);
            setActiveTab('dashboard');
          },
          handleNavigateTab,
          currentUser,
        )}
      </View>

      {/* ── Bottom Tab Navigation Bar ── */}
      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {visibleTabs.map((tab) => {
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
  currentUser: AuthUser,
) {
  const isCustodian = currentUser.role === 'custodian';

  switch (activeTab) {
    case 'faculty':
      if (!isCustodian) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
              Custodian Only
            </Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', maxWidth: 300 }}>
              Only the Laboratory Custodian can add, edit, or delete faculty credentials and information.
            </Text>
          </View>
        );
      }
      return <FacultyManagementScreen />;

    case 'schedule':
      return <LaboratorySchedulingScreen userRole={currentUser.role} currentUser={currentUser} />;

    case 'records':
      if (!isCustodian) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
              Custodian Only
            </Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', maxWidth: 300 }}>
              Access history and door security records are restricted to the Laboratory Custodian.
            </Text>
          </View>
        );
      }
      return <AccessRecordsScreen onNavigateReport={() => onNavigateTab('reports')} />;

    case 'reports':
      if (!isCustodian) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
              Custodian Only
            </Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', maxWidth: 300 }}>
              Institutional attendance and punctuality reports are restricted to the Laboratory Custodian.
            </Text>
          </View>
        );
      }
      return <ReportScreen />;

    case 'monitoring':
      if (!isCustodian) {
        return (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.textPrimary }}>
              Custodian Only
            </Text>
            <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center', maxWidth: 300 }}>
              Real-time laboratory monitoring and camera feeds are restricted to the Laboratory Custodian.
            </Text>
          </View>
        );
      }
      return <RealtimeMonitoringScreen currentUser={currentUser} adminUsername={currentUser.username} />;

    case 'profile':
      return <ProfileScreen onSignedOut={onSignedOut} currentUser={currentUser} adminUsername={currentUser.username} />;

    default:
      return <DashboardScreen onNavigateTab={onNavigateTab} currentUser={currentUser} adminUsername={currentUser.username} />;
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
  roleBadgeHeader: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 2,
  },
  roleBadgeCustodian: {
    backgroundColor: 'rgba(59, 130, 246, 0.25)',
  },
  roleBadgeFaculty: {
    backgroundColor: 'rgba(245, 158, 11, 0.25)',
  },
  roleBadgeHeaderText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  roleTextCustodian: {
    color: '#93C5FD',
  },
  roleTextFaculty: {
    color: '#FCD34D',
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
