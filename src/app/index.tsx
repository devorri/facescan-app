import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Shadow, Spacing } from '@/constants/design';
import { AccessRecordsScreen } from '@/screens/AccessRecordsScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { FacultyManagementScreen } from '@/screens/FacultyManagementScreen';
import { LaboratorySchedulingScreen } from '@/screens/LaboratorySchedulingScreen';
import { LoginScreen } from '@/screens/LoginScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';
import { RealtimeMonitoringScreen } from '@/screens/RealtimeMonitoringScreen';

type TabKey = 'dashboard' | 'faculty' | 'schedule' | 'records' | 'monitoring' | 'profile';

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'faculty', label: 'Faculty' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'records', label: 'Records' },
  { key: 'monitoring', label: 'Monitor' },
  { key: 'profile', label: 'Profile' },
];

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  if (!isLoggedIn) {
    return (
      <LoginScreen
        onSignedIn={() => setIsLoggedIn(true)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Image
          source={require('@/assets/images/logo.png')}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Lab Access Admin</Text>
      </View>
      <View style={styles.content}>{renderScreen(activeTab, () => { setIsLoggedIn(false); setActiveTab('dashboard'); })}</View>
      <View style={styles.tabShell}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, activeTab === tab.key && styles.activeTab]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function renderScreen(activeTab: TabKey, onSignedOut: () => void) {
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
      return <DashboardScreen />;
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
  tabShell: {
    backgroundColor: Colors.navy,
    borderTopWidth: 1,
    borderTopColor: Colors.navyLight,
  },
  tabs: {
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
    minWidth: 84,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    height: 36,
  },
  activeTab: {
    backgroundColor: Colors.navyLight,
  },
  tabText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  activeTabText: {
    color: Colors.blueLight,
  },
});
