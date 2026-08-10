import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Activity, CalendarDays, ClipboardList, LayoutDashboard, type LucideIcon, UserCircle, Users } from 'lucide-react-native';
import { Colors, Radius, Spacing } from '@/constants/design';
import { AccessRecordsScreen } from '@/screens/AccessRecordsScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { FacultyManagementScreen } from '@/screens/FacultyManagementScreen';
import { LaboratorySchedulingScreen } from '@/screens/LaboratorySchedulingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { RealtimeMonitoringScreen } from '@/screens/RealtimeMonitoringScreen';

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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const insets = useSafeAreaInsets();

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onSignedIn={() => setIsLoggedIn(true)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.title}>CCS Smartlab Access</Text>
      </View>

      <View style={styles.content}>
        {renderScreen(
          activeTab,
          () => { setIsLoggedIn(false); setActiveTab('dashboard'); },
          (tab) => setActiveTab(tab)
        )}
      </View>

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
) {
  switch (activeTab) {
    case 'faculty':
      return <FacultyManagementScreen />;
    case 'schedule':
      return <LaboratorySchedulingScreen />;
    case 'records':
      return <AccessRecordsScreen />;
    case 'monitoring':
      return <RealtimeMonitoringScreen />;
    case 'profile':
      return <ProfileScreen onSignedOut={onSignedOut} />;
    default:
      return <DashboardScreen onNavigateTab={onNavigateTab} />;
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
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    paddingTop: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.navyLight,
  },
  headerLogo: {
    width: 36,
    height: 36,
  },
  title: {
    color: Colors.textWhite,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.2,
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
